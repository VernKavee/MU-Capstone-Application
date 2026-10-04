-- The arm the user chose for the workout, for an exercise whose rule_based_logic has
-- state_machine.chooses_side (the bicep curl); null for the others. Written once, by the
-- first set's save, like the targets. The table-level insert grant already covers a new
-- column, and no update grant is added, so it is fixed like the rest of the setup.
alter table public.workouts add column side text check (side in ('left', 'right'));
