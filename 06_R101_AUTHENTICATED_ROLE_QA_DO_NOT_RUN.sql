-- PostgreSQL 17 disposable GitHub Actions fixture only.
-- Does not prove cryptographic JWT validation by PostgREST; this tests DB role ACLs.
BEGIN;
GRANT EXECUTE ON FUNCTION dpro_tax_r10_internal.finalize_approved_demo(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.taxacc_r10_finalize_approved_demo(uuid,date) TO authenticated;
SELECT set_config('r101.test_batch', id::text, true)
FROM public.taxacc_r9_monthly_review_batches WHERE target_period_label='2026-11';
SELECT set_config('r101.test_reviewer', auth_user_id::text, true)
FROM public.taxacc_staff WHERE staff_code='TAX-ST-001';
SELECT set_config('r101.test_submitter', auth_user_id::text, true)
FROM public.taxacc_staff WHERE staff_code='TAX-ST-002';
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 IF current_user <> 'anon' THEN RAISE EXCEPTION 'R101_ANON_ROLE_INCORRECT';END IF;
 BEGIN
   PERFORM public.taxacc_r10_finalize_approved_demo(current_setting('r101.test_batch')::uuid,
      (now() AT TIME ZONE 'Asia/Tokyo')::date+14);
   RAISE EXCEPTION 'R101_ANON_FUNCTION_CALL_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN
   RAISE NOTICE 'R101_ANON_ROLE_DENIED_PASS';
 END;
END;$anon$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $auth$
DECLARE v_batch uuid:=current_setting('r101.test_batch')::uuid;
 v_due date:=(now() AT TIME ZONE 'Asia/Tokyo')::date+14;v_result jsonb;
BEGIN
 IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'R101_AUTH_ROLE_INCORRECT';END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_due);
  RAISE EXCEPTION 'R101_MISSING_JWT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',current_setting('r101.test_submitter'),true);
 BEGIN
  PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_due);
  RAISE EXCEPTION 'R101_SUBMITTER_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',current_setting('r101.test_reviewer'),true);
 v_result:=public.taxacc_r10_finalize_approved_demo(v_batch,v_due);
 IF (v_result->>'request_count')::int<>4 OR (v_result->>'already_finalized')::boolean IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'R101_AUTHORIZED_REVIEWER_FAILED'; END IF;
 v_result:=public.taxacc_r10_finalize_approved_demo(v_batch,v_due);
 IF (v_result->>'already_finalized')::boolean IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'R101_AUTHENTICATED_REPEAT_FAILED'; END IF;
 RAISE NOTICE 'R101_AUTHENTICATED_ROLE_QA_PASS_ROLLBACK';
END;$auth$;
ROLLBACK;
