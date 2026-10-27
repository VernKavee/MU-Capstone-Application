-- Run with `npm run test:db`. The feedback service's knowledge base tables (ADR-0007,
-- migration kb_langchain_tables) are unreachable through the API and keep the layout
-- langchain_postgres expects. They may already hold a copied collection, so nothing here
-- assumes they are empty.
begin;
select plan(8);

select ok((select relrowsecurity from pg_class where oid = 'public.langchain_pg_collection'::regclass),
  'row-level security is on for the collections');
select ok((select relrowsecurity from pg_class where oid = 'public.langchain_pg_embedding'::regclass),
  'and for the chunks');

select lives_ok(
  $$ insert into public.langchain_pg_collection (uuid, name, cmetadata)
       values ('00000000-0000-0000-0000-0000000000aa', 'pgtap_test', null);
     insert into public.langchain_pg_embedding (id, collection_id, embedding, document, cmetadata)
       values ('pgtap-1', '00000000-0000-0000-0000-0000000000aa', '[0.1, 0.2, 0.3]', 'Knees over toes.',
               '{"exercise_id": "squat", "item_kind": "principle", "fault_tags": "|knee_valgus|"}') $$,
  'a direct connection writes a collection and a chunk with its vector');
select is((select count(*) from public.langchain_pg_embedding where cmetadata @> '{"exercise_id": "squat"}'
             and collection_id = '00000000-0000-0000-0000-0000000000aa'), 1::bigint,
  'chunks are found by their metadata');
delete from public.langchain_pg_collection where uuid = '00000000-0000-0000-0000-0000000000aa';
select is((select count(*) from public.langchain_pg_embedding where id = 'pgtap-1'), 0::bigint,
  'deleting a collection deletes its chunks');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select count(*) from public.langchain_pg_embedding $$, '42501', null,
  'a signed-in user cannot read the chunks through the API');
select throws_ok($$ insert into public.langchain_pg_collection (uuid, name) values (gen_random_uuid(), 'x') $$,
  '42501', null, 'nor add a collection');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.langchain_pg_collection $$, '42501', null, 'nor can a visitor read');
reset role;

select * from finish();
rollback;
