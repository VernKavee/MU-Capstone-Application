-- One line under each exercise on Home saying how to stand to the camera (2026-11-05, Vern,
-- from the Daylight mockup). A camera field for the app like `landscape`, not engine logic,
-- so it lives outside rule_based_logic and its export. The angles are the ones the guide
-- text and placement already use: 45 degrees for the squat and the curl, side-on (90) for
-- the lunge and the push-up. The existing select grant on exercises covers the column.
alter table public.exercises add column camera_hint text;

update public.exercises set camera_hint = case id
  when 'squat' then '45 degrees to the camera'
  when 'push-up' then 'Side-on, phone sideways'
  when 'lunge' then 'Side-on to the camera'
  when 'bicep-curl' then '45 degrees, your arm toward the camera'
end;

alter table public.exercises alter column camera_hint set not null;
