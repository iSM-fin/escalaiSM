import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

// Inicializa o Firebase Admin
admin.initializeApp();

// Lista de emails que podem conceder permissões de admin (bootstrap)
const BOOTSTRAP_ADMIN_EMAILS = ["financeiro@ismsaude.com"];

/**
 * Cloud Function para definir Custom Claims de admin
 * Chamada por admins existentes para promover outros usuários
 */
export const setAdminClaim = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    // Verifica se o chamador está autenticado
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Você precisa estar autenticado para executar esta ação."
      );
    }

    const callerEmail = request.auth.token.email;
    const callerUid = request.auth.uid;

    // Verifica se o chamador tem permissão
    const callerIsBootstrap = BOOTSTRAP_ADMIN_EMAILS.includes(callerEmail || "");
    const callerClaims = request.auth.token;
    const callerIsAdmin = callerClaims.admin === true;

    // Também verifica no Firestore se o chamador é ADM
    let callerIsStoredAdmin = false;
    try {
      const callerDoc = await admin
        .firestore()
        .collection("user_profiles")
        .doc(callerUid)
        .get();

      if (callerDoc.exists) {
        const callerData = callerDoc.data();
        callerIsStoredAdmin = callerData?.role === "ADM";
      }
    } catch (error) {
      console.error("Erro ao verificar role do chamador:", error);
    }

    if (!callerIsBootstrap && !callerIsAdmin && !callerIsStoredAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Apenas administradores podem conceder permissões de admin."
      );
    }

    // Obtém os dados da requisição
    const { targetUid, isAdmin } = request.data;

    if (!targetUid || typeof targetUid !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "É necessário fornecer o UID do usuário alvo."
      );
    }

    try {
      // Define os Custom Claims
      await admin.auth().setCustomUserClaims(targetUid, {
        admin: isAdmin === true,
      });

      // Atualiza o role no Firestore também
      if (isAdmin) {
        await admin
          .firestore()
          .collection("user_profiles")
          .doc(targetUid)
          .update({
            role: "ADM",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: callerUid,
          });
      }

      console.log(
        `Custom claims atualizados para ${targetUid}: admin=${isAdmin}`
      );

      return {
        success: true,
        message: `Permissões de admin ${isAdmin ? "concedidas" : "revogadas"} com sucesso.`,
      };
    } catch (error) {
      console.error("Erro ao definir custom claims:", error);
      throw new HttpsError(
        "internal",
        "Erro ao atualizar permissões do usuário."
      );
    }
  }
);

/**
 * Trigger: Quando o role de um usuário é atualizado no Firestore,
 * sincroniza com os Custom Claims
 */
export const syncRoleToCustomClaims = onDocumentUpdated(
  {
    document: "user_profiles/{userId}",
    region: "southamerica-east1",
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const userId = event.params.userId;

    // Verifica se o role mudou
    if (beforeData?.role === afterData?.role) {
      return null;
    }

    const newRole = afterData?.role;
    const isAdmin = newRole === "ADM";

    try {
      // Atualiza os Custom Claims
      await admin.auth().setCustomUserClaims(userId, {
        admin: isAdmin,
      });

      console.log(
        `[syncRoleToCustomClaims] Sincronizado: ${userId} -> admin=${isAdmin}`
      );

      return { success: true };
    } catch (error) {
      console.error(
        `[syncRoleToCustomClaims] Erro ao sincronizar claims para ${userId}:`,
        error
      );
      return { success: false, error };
    }
  }
);

/**
 * Cloud Function para obter os Custom Claims de um usuário
 * Útil para debug e verificação
 */
export const getUserClaims = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Você precisa estar autenticado."
      );
    }

    // Apenas admins podem ver claims de outros usuários
    const callerClaims = request.auth.token;
    const targetUid = request.data?.targetUid || request.auth.uid;

    // Se está pedindo claims de outro usuário, verifica permissão
    if (targetUid !== request.auth.uid && callerClaims.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Você não tem permissão para ver claims de outros usuários."
      );
    }

    try {
      const user = await admin.auth().getUser(targetUid);
      return {
        uid: user.uid,
        email: user.email,
        customClaims: user.customClaims || {},
      };
    } catch (error) {
      console.error("Erro ao buscar claims:", error);
      throw new HttpsError("not-found", "Usuário não encontrado.");
    }
  }
);

/**
 * Cloud Function para inicializar admin bootstrap
 * Executa uma única vez para configurar o primeiro admin
 */
export const initializeFirstAdmin = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Você precisa estar autenticado."
      );
    }

    const callerEmail = request.auth.token.email;

    // Apenas emails bootstrap podem inicializar
    if (!BOOTSTRAP_ADMIN_EMAILS.includes(callerEmail || "")) {
      throw new HttpsError(
        "permission-denied",
        "Apenas emails autorizados podem inicializar o sistema."
      );
    }

    try {
      // Define o chamador como admin
      await admin.auth().setCustomUserClaims(request.auth.uid, {
        admin: true,
      });

      // Atualiza o Firestore
      await admin
        .firestore()
        .collection("user_profiles")
        .doc(request.auth.uid)
        .set(
          {
            email: callerEmail,
            role: "ADM",
            name: request.auth.token.name || "Administrador",
            isBootstrapAdmin: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      console.log(`Primeiro admin inicializado: ${callerEmail}`);

      return {
        success: true,
        message: "Você foi configurado como administrador do sistema.",
      };
    } catch (error) {
      console.error("Erro ao inicializar admin:", error);
      throw new HttpsError("internal", "Erro ao configurar administrador.");
    }
  }
);
