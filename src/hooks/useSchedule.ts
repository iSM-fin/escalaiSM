
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Assignment, LocationData } from '../types';
import { useAuth } from '../context/AuthContext';

// Hook para buscar a estrutura (Hospitais e Turnos)
export const useStructure = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['structure', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: hospitals, error: hError } = await supabase
        .from('hospitals')
        .select('*')
        .order('created_at', { ascending: true });
      if (hError) throw hError;

      const { data: shifts, error: sError } = await supabase
        .from('shifts')
        .select('*')
        .order('created_at', { ascending: true });
      if (sError) throw sError;

      // Transformar dados planos do DB para a estrutura aninhada da UI
      const structure: LocationData[] = hospitals.map(h => ({
        id: h.id,
        name: h.name,
        theme: h.theme as any,
        shifts: shifts
          .filter(s => s.hospital_id === h.id)
          .map(s => ({
            id: s.id,
            name: s.name,
            schedule: [] // Será preenchido na visualização
          }))
      }));

      return structure;
    },
    enabled: !!user
  });
};

// Hook para buscar Plantões de um Mês específico
export const useAssignments = (monthKey: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['assignments', user?.id, monthKey],
    queryFn: async () => {
      if (!user) return [];
      
      // Filtrar por data (LIKE '2026-01%')
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .like('date', `${monthKey}%`);
      
      if (error) throw error;

      return data.map((row: any) => ({
        // Mapear colunas do DB para objeto Assignment da UI
        id: row.id,
        shiftId: row.shift_id,
        date: row.date,
        name: row.doctor_name,
        time: row.time_display,
        isBold: row.is_bold,
        isRed: row.is_red,
        isFlagged: row.is_flagged,
        isVerified: row.is_verified,
        subName: row.sub_name,
        note: row.note,
        value: row.value,
        extraValue: row.extra_value,
        extraValueReason: row.extra_value_reason,
        period: row.period
      }));
    },
    enabled: !!user
  });
};

// Hook para salvar/atualizar plantão
export const useSaveAssignment = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: any) => {
      if (!user) throw new Error("User not logged in");
      
      // Converter objeto UI para Snake Case do DB
      const dbPayload = {
        date: payload.dateKey,
        shift_id: payload.shiftId,
        doctor_name: payload.assignment.name,
        time_display: payload.assignment.time,
        is_bold: payload.assignment.isBold,
        is_red: payload.assignment.isRed,
        is_flagged: payload.assignment.isFlagged,
        is_verified: payload.assignment.isVerified,
        sub_name: payload.assignment.subName,
        note: payload.assignment.note,
        value: payload.assignment.value,
        extra_value: payload.assignment.extraValue,
        extra_value_reason: payload.assignment.extraValueReason,
        period: payload.assignment.period,
        owner_id: user.id
      };

      if (payload.id) {
        // Update
        const { error } = await supabase
            .from('assignments')
            .update(dbPayload)
            .eq('id', payload.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
            .from('assignments')
            .insert(dbPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    }
  });
};
