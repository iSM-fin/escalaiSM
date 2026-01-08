import { NotificationLog, NotificationType, Assignment, ScheduleStore } from '../types';

// ============================================
// CONFIGURAÇÃO DO SERVIÇO DE EMAIL
// ============================================
// Escolha UMA das opções abaixo e configure:

// OPÇÃO 1: Resend (Recomendado - 3000 emails grátis/mês)
// Crie sua conta em: https://resend.com
const RESEND_API_KEY = 're_GTcoTvYe_AwW75HYxM9PY4tXjqSHRh4L5';
const FROM_EMAIL = 'onboarding@resend.dev'; // Use seu domínio verificado ou este para teste

// OPÇÃO 2: SendGrid
// const SENDGRID_API_KEY = '';

// ============================================

export interface EmailData {
    to: string;
    subject: string;
    body: string;
    html?: string;
}

/**
 * Send email notification using Resend API
 */
export const sendEmail = async (emailData: EmailData): Promise<boolean> => {
    // Se não tiver API key configurada, simula o envio
    if (!RESEND_API_KEY) {
        console.log('⚠️ RESEND_API_KEY não configurada. Email simulado:', emailData.to, emailData.subject);
        console.log('📧 [SIMULAÇÃO] Para:', emailData.to);
        console.log('📧 [SIMULAÇÃO] Assunto:', emailData.subject);
        return true; // Retorna sucesso para não bloquear o fluxo
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: [emailData.to],
                subject: emailData.subject,
                html: emailData.html || emailData.body,
                text: emailData.body
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Erro ao enviar email:', errorData);
            return false;
        }

        const result = await response.json();
        console.log('✅ Email enviado com sucesso! ID:', result.id);
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        return false;
    }
};

/**
 * Create notification log entry
 */
export const createNotificationLog = (
    type: NotificationType,
    recipientEmail: string,
    recipientName: string,
    subject: string,
    body: string,
    context?: {
        dateKey?: string;
        locationName?: string;
        shiftName?: string;
        doctorName?: string;
    }
): NotificationLog => {
    return {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type,
        recipientEmail,
        recipientName,
        subject,
        body,
        status: 'pending',
        ...context
    };
};

/**
 * Generate email body for schedule reminder (24h before)
 */
export const generateReminderEmail = (
    doctorName: string,
    date: string,
    shifts: Array<{
        locationName: string;
        shiftName: string;
        time: string;
    }>
): { subject: string; body: string; html: string } => {
    const subject = `Lembrete: Plantão amanhã ${date}`;

    const shiftsText = shifts.map(s =>
        `${s.locationName} das ${s.time} no ${s.shiftName}`
    ).join(' e ');

    const body = `Olá Dr(a). ${doctorName}, tudo bem?

Amanhã ${date} o(a) senhor(a) está escalado(a) em:
${shifts.map(s => `- ${s.locationName} das ${s.time} no ${s.shiftName}`).join('\n')}

Atenciosamente,
Sistema de Gestão de Escalas`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .shift-item { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea; border-radius: 5px; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="margin: 0;">🏥 Lembrete de Plantão</h2>
                </div>
                <div class="content">
                    <p>Olá <strong>Dr(a). ${doctorName}</strong>, tudo bem?</p>
                    <p>Amanhã <strong>${date}</strong> o(a) senhor(a) está escalado(a) em:</p>
                    ${shifts.map(s => `
                        <div class="shift-item">
                            <strong>${s.locationName}</strong><br>
                            <span style="color: #667eea;">⏰ ${s.time}</span> - ${s.shiftName}
                        </div>
                    `).join('')}
                    <p style="margin-top: 20px;">Atenciosamente,<br><strong>Sistema de Gestão de Escalas</strong></p>
                </div>
                <div class="footer">
                    Este é um email automático. Por favor, não responda.
                </div>
            </div>
        </body>
        </html>
    `;

    return { subject, body, html };
};

/**
 * Generate email body for schedule change notification
 */
export const generateChangeNotificationEmail = (
    action: 'create' | 'edit' | 'delete' | 'flag',
    userName: string,
    doctorName: string,
    locationName: string,
    shiftName: string,
    date: string,
    details?: string
): { subject: string; body: string; html: string } => {
    const actionText = {
        create: 'criou um novo plantão',
        edit: 'editou um plantão',
        delete: 'removeu um plantão',
        flag: 'sinalizou um plantão'
    };

    const subject = `Alteração na Escala: ${actionText[action]}`;

    const body = `Alteração na Escala

${userName} ${actionText[action]}:

Médico: ${doctorName}
Hospital: ${locationName}
Turno: ${shiftName}
Data: ${date}
${details ? `\nDetalhes: ${details}` : ''}

Sistema de Gestão de Escalas`;

    const actionEmoji = {
        create: '➕',
        edit: '✏️',
        delete: '🗑️',
        flag: '🚩'
    };

    const actionColor = {
        create: '#10b981',
        edit: '#3b82f6',
        delete: '#ef4444',
        flag: '#f59e0b'
    };

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${actionColor[action]}; color: white; padding: 20px; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid ${actionColor[action]}; }
                .info-row { margin: 8px 0; }
                .label { font-weight: bold; color: #666; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2 style="margin: 0;">${actionEmoji[action]} Alteração na Escala</h2>
                </div>
                <div class="content">
                    <p><strong>${userName}</strong> ${actionText[action]}:</p>
                    <div class="info-box">
                        <div class="info-row"><span class="label">Médico:</span> ${doctorName}</div>
                        <div class="info-row"><span class="label">Hospital:</span> ${locationName}</div>
                        <div class="info-row"><span class="label">Turno:</span> ${shiftName}</div>
                        <div class="info-row"><span class="label">Data:</span> ${date}</div>
                        ${details ? `<div class="info-row"><span class="label">Detalhes:</span> ${details}</div>` : ''}
                    </div>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">
                        Sistema de Gestão de Escalas
                    </p>
                </div>
                <div class="footer">
                    Este é um email automático. Por favor, não responda.
                </div>
            </div>
        </body>
        </html>
    `;

    return { subject, body, html };
};

/**
 * Queue notification for sending
 */
export const queueNotification = async (
    store: ScheduleStore,
    log: NotificationLog
): Promise<ScheduleStore> => {
    const logs = store.notificationLogs || [];
    return {
        ...store,
        notificationLogs: [log, ...logs]
    };
};

/**
 * Process pending notifications
 * This should be called periodically (e.g., every minute) by a background job
 */
export const processPendingNotifications = async (
    store: ScheduleStore
): Promise<ScheduleStore> => {
    const logs = store.notificationLogs || [];
    const pending = logs.filter(log => log.status === 'pending');

    const updatedLogs = [...logs];

    for (const log of pending) {
        const emailData: EmailData = {
            to: log.recipientEmail,
            subject: log.subject,
            body: log.body
        };

        const success = await sendEmail(emailData);

        const index = updatedLogs.findIndex(l => l.id === log.id);
        if (index !== -1) {
            updatedLogs[index] = {
                ...log,
                status: success ? 'sent' : 'failed',
                error: success ? undefined : 'Failed to send email'
            };
        }
    }

    return {
        ...store,
        notificationLogs: updatedLogs
    };
};
