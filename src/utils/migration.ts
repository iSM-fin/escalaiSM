
import { supabase } from '../lib/supabase';
import { ScheduleStore, Assignment } from '../types';

export const migrateData = async (userId: string) => {
  const saved = localStorage.getItem('schedule_store');
  if (!saved) return;

  const store: ScheduleStore = JSON.parse(saved);
  
  // 1. Migrar Médicos
  if (store.doctors) {
      await supabase.from('doctors').upsert(
          store.doctors.map(d => ({ name: d.name, type: d.type, owner_id: userId })),
          { onConflict: 'name,owner_id' }
      );
  }

  // 2. Migrar Estrutura (Hospitais e Turnos)
  // Precisamos criar mapas para traduzir IDs antigos para UUIDs do Supabase
  const shiftIdMap: Record<string, string> = {};

  for (const loc of store.structure) {
      const { data: hospData, error: hErr } = await supabase
          .from('hospitals')
          .insert({ name: loc.name, theme: loc.theme, owner_id: userId })
          .select()
          .single();
      
      if (hospData) {
          for (const shift of loc.shifts) {
              const { data: shiftData } = await supabase
                  .from('shifts')
                  .insert({ name: shift.name, hospital_id: hospData.id, owner_id: userId })
                  .select()
                  .single();
              
              if (shiftData) {
                  shiftIdMap[shift.id] = shiftData.id;
              }
          }
      }
  }

  // 3. Migrar Assignments
  const assignmentsToInsert: any[] = [];
  
  Object.keys(store.months).forEach(monthKey => {
      const monthData = store.months[monthKey];
      Object.keys(monthData).forEach(locId => {
          Object.keys(monthData[locId]).forEach(shiftId => {
              const newShiftId = shiftIdMap[shiftId];
              if (!newShiftId) return;

              Object.keys(monthData[locId][shiftId]).forEach(dateKey => {
                  const assigns = monthData[locId][shiftId][dateKey];
                  assigns.forEach((a: Assignment) => {
                      assignmentsToInsert.push({
                          date: dateKey,
                          shift_id: newShiftId,
                          doctor_name: a.name,
                          time_display: a.time,
                          is_bold: a.isBold,
                          is_red: a.isRed,
                          value: a.value || 0,
                          owner_id: userId
                      });
                  });
              });
          });
      });
  });

  if (assignmentsToInsert.length > 0) {
      // Inserir em lotes
      const { error } = await supabase.from('assignments').insert(assignmentsToInsert);
      if (error) console.error('Migration error', error);
      else alert('Migração concluída com sucesso! Recarregue a página.');
  }
};
