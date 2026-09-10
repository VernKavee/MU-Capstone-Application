-- Run with `npm run test:db`. The knowledge base starts empty, is unreachable through the
-- API, and its embedding column takes a vector of any length until Sujira's model is
-- chosen (ADR-0007).
begin;
select plan(5);

select is((select count(*) from public.knowledge_base), 0::bigint, 'the knowledge base starts empty');
select lives_ok(
  $$ insert into public.knowledge_base (exercise_id, content, embedding)
     values ('squat', 'Knees track in line with the toes.', '[0.1, 0.2, 0.3]'),
            ('lunge', 'Keep the torso upright.', '[0.1, 0.2, 0.3, 0.4, 0.5]') $$,
  'chunks take embeddings of any length until the model is chosen');
select throws_ok(
  $$ insert into public.knowledge_base (exercise_id, content) values ('plank', 'Hold a straight line.') $$,
  '23503', null, 'every chunk belongs to an exercise in the catalogue');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select count(*) from public.knowledge_base $$, '42501', null,
  'a signed-in user cannot read it through the API');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.knowledge_base $$, '42501', null, 'nor can a visitor');
reset role;

select * from finish();
rollback;
