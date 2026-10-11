-- R10.1 QA ONLY: never run unless 01_R101_STAGE_MONTHLY_FINALIZE_DO_NOT_DEPLOY.sql was installed
-- in the SAME transaction or an isolated QA database. All changes rolled back.
BEGIN;
GRANT EXECUTE ON FUNCTION dpro_tax_r10_internal.finalize_approved_demo(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.taxacc_r10_finalize_approved_demo(uuid,date) TO authenticated;
DO $r10_qa$
DECLARE
 v_batch uuid;v_reviewer uuid;v_submitter uuid;v_request_id uuid;v_res jsonb;
 v_date date:=(now() AT TIME ZONE 'Asia/Tokyo')::date+14;
 v_count int;v_pass int:=0;v_step text:='setup';
BEGIN
 BEGIN
 SELECT b.id INTO STRICT v_batch FROM public.taxacc_r9_monthly_review_batches b
 JOIN public.taxacc_offices o ON o.id=b.office_id WHERE o.office_code='dpro_taxacc_demo'
 AND b.target_period_label='2026-11' AND b.template_code='MONTHLY-BASIC' AND b.state='approved';
 SELECT s.auth_user_id INTO STRICT v_reviewer FROM public.taxacc_staff s
 JOIN public.taxacc_offices o ON o.id=s.office_id
 WHERE o.office_code='dpro_taxacc_demo' AND s.staff_code='TAX-ST-001';
 SELECT s.auth_user_id INTO STRICT v_submitter FROM public.taxacc_staff s
 JOIN public.taxacc_offices o ON o.id=s.office_id
 WHERE o.office_code='dpro_taxacc_demo' AND s.staff_code='TAX-ST-002';
 v_step:='missing_auth';PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_date);
 RAISE EXCEPTION 'R10_ANON_BYPASSED';EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='wrong_reviewer';PERFORM set_config('request.jwt.claim.sub',v_submitter::text,true);
 BEGIN PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_date);
 RAISE EXCEPTION 'R10_SUBMITTER_BYPASSED';EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='unlinked_identity';PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_date);
 RAISE EXCEPTION 'R10_UNLINKED_BYPASSED';EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='invalid_deadline';PERFORM set_config('request.jwt.claim.sub',v_reviewer::text,true);
 BEGIN PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_date-300);
 RAISE EXCEPTION 'R10_INVALID_DATE_BYPASSED';EXCEPTION WHEN invalid_parameter_value THEN v_pass:=v_pass+1;END;
 v_step:='finalize_private';v_res:=public.taxacc_r10_finalize_approved_demo(v_batch,v_date);
 IF v_res->>'ok'<>'true' OR v_res->>'already_finalized'<>'false' OR (v_res->>'request_count')::int<>4
 OR v_res->>'line_dispatched'<>'false' OR v_res->>'client_visible'<>'false' THEN
 RAISE EXCEPTION 'R10_FINALIZE_RESULT_INVALID';END IF;v_pass:=v_pass+1;
 v_step:='request_count';
 SELECT count(*) INTO v_count FROM public.taxacc_document_requests r WHERE r.r10_approval_batch_id=v_batch;
 IF v_count<>4 THEN RAISE EXCEPTION 'R10_REQUESTS_NOT_FOUR';END IF;v_pass:=v_pass+1;
 v_step:='all_private';
 SELECT count(*) INTO v_count FROM public.taxacc_document_requests r
 WHERE r.r10_approval_batch_id=v_batch AND r.status='not_notified'
 AND r.is_visible_to_client=false AND r.is_demo=true AND r.requested_at IS NULL;
 IF v_count<>4 THEN RAISE EXCEPTION 'R10_PRIVATE_FLAG_INVALID';END IF;v_pass:=v_pass+1;
 v_step:='all_items';SELECT count(*) INTO v_count FROM public.taxacc_document_request_items i
 JOIN public.taxacc_document_requests r ON r.office_id=i.office_id AND r.id=i.request_id
 WHERE r.r10_approval_batch_id=v_batch;
 IF v_count<>20 THEN RAISE EXCEPTION 'R10_REQUEST_ITEM_COUNT_INVALID';END IF;v_pass:=v_pass+1;
 v_step:='duplicate_idempotent';v_res:=public.taxacc_r10_finalize_approved_demo(v_batch,v_date);
 IF v_res->>'already_finalized'<>'true' THEN RAISE EXCEPTION 'R10_NON_IDEMPOTENT';END IF;v_pass:=v_pass+1;
 v_step:='due_conflict';BEGIN PERFORM public.taxacc_r10_finalize_approved_demo(v_batch,v_date+1);
 RAISE EXCEPTION 'R10_DUE_CONFLICT_ALLOWED';EXCEPTION WHEN unique_violation THEN v_pass:=v_pass+1;END;
 v_step:='legacy_monthly_create_denied';
 BEGIN
 INSERT INTO public.taxacc_document_requests(office_id,client_id,request_code,title,
 request_category,target_period_label,requested_on,status,is_visible_to_client,is_demo)
 SELECT i.office_id,i.client_id,'R10QA-BYPASS','R10 unauthorized monthly','monthly','2026-12',v_date,
 'requested',true,true FROM public.taxacc_r9_monthly_review_items i WHERE i.batch_id=v_batch LIMIT 1;
 RAISE EXCEPTION 'R10_LEGACY_BYPASS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='legacy_update_denied';SELECT id INTO v_request_id
 FROM public.taxacc_document_requests WHERE r10_approval_batch_id=v_batch LIMIT 1;
 BEGIN UPDATE public.taxacc_document_requests SET is_visible_to_client=true WHERE id=v_request_id;
 RAISE EXCEPTION 'R10_PRE_DISPATCH_UNLOCK_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='legacy_delete_denied';BEGIN DELETE FROM public.taxacc_document_requests WHERE id=v_request_id;
 RAISE EXCEPTION 'R10_PRE_DISPATCH_DELETE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='legacy_category_conversion_denied';
 BEGIN
   UPDATE public.taxacc_document_requests SET request_category='monthly'
   WHERE office_id=(SELECT office_id FROM public.taxacc_r9_monthly_review_batches WHERE id=v_batch)
     AND request_category='closing';
   RAISE EXCEPTION 'R101_LEGACY_CATEGORY_CONVERSION_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='child_update_denied';
 BEGIN UPDATE public.taxacc_document_request_items SET item_name='tampered'
   WHERE request_id=v_request_id;
   RAISE EXCEPTION 'R101_CHILD_UPDATE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='child_delete_denied';
 BEGIN DELETE FROM public.taxacc_document_request_items WHERE request_id=v_request_id;
   RAISE EXCEPTION 'R101_CHILD_DELETE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='child_insert_denied';
 BEGIN INSERT INTO public.taxacc_document_request_items(office_id,request_id,item_code,item_name,is_required,sort_order,status)
   SELECT r.office_id,r.id,'R101-ATTACK','should block',true,100,'missing'
   FROM public.taxacc_document_requests r WHERE r.id=v_request_id;
   RAISE EXCEPTION 'R101_CHILD_INSERT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN v_pass:=v_pass+1;END;
 v_step:='job_link_count';
 SELECT count(*) INTO v_count FROM public.taxacc_r10_finalization_links WHERE batch_id=v_batch;
 IF v_count<>4 THEN RAISE EXCEPTION 'R10_LINK_COUNT_INVALID';END IF;v_pass:=v_pass+1;
 IF v_pass<>18 THEN RAISE EXCEPTION 'R101_QA_EXPECTED_18_GOT_%',v_pass;END IF;
 RAISE EXCEPTION 'R101_QA_18_PASS_ROLLBACK';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'R101_QA_18_PASS_ROLLBACK' THEN RAISE EXCEPTION 'R10_QA_FAIL_AT_%: %',v_step,SQLERRM;END IF;
  RAISE NOTICE 'R101_QA_18_PASS_ROLLBACK';
 END;
END $r10_qa$;
ROLLBACK;
-- Read-only recheck after COMMIT/ROLLBACK: original requests must remain unchanged.
SELECT (SELECT count(*) FROM public.taxacc_document_requests r JOIN public.taxacc_offices o ON o.id=r.office_id
 WHERE o.office_code='dpro_taxacc_demo') AS existing_requests_after_rollback;
