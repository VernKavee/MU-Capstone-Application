-- The push-up is filmed with the phone sideways (2026-10-21, Vern): side-on at 90 degrees a
-- plank is about as long as the user is tall and does not fit a portrait frame. A camera
-- field for the app, not engine logic, so it lives outside rule_based_logic and its export.
-- The live screen holds the start while the camera picture is portrait. The existing select
-- grant on exercises covers the column.
alter table public.exercises add column landscape boolean not null default false;

update public.exercises set landscape = true where id = 'push-up';

update public.exercises set guide_text = replace(guide_text,
  $old$with your whole body in frame from head to feet.$old$,
  $new$with your whole body in frame from head to feet. Turn your phone sideways (landscape) so the whole plank fits.$new$)
where id = 'push-up';
