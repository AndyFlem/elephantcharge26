-- One-off data fix: point beneficiaries.logo_file_name at the files relocated from
-- elephantcharge-system/frontend/public/beneficiaries/logos/000/000/<id>/original/<file>
-- to elephantcharge-system/backend/public/beneficiaries/logos/<id>_<file>.
-- Also corrects two rows (7, 17) whose logo_file_name never matched the real file
-- (id 7 said "GRI.png" for what is actually a JPEG named gri.jpg; id 17 said
-- "PL-Regular-Logo.png" for what is actually projectluangwa.jpg).

UPDATE beneficiaries SET logo_file_name = '1_clz.jpg' WHERE id = 1;
UPDATE beneficiaries SET logo_file_name = '2_wecsz.png' WHERE id = 2;
UPDATE beneficiaries SET logo_file_name = '3_kt_large.jpg' WHERE id = 3;
UPDATE beneficiaries SET logo_file_name = '4_cls-logo-final-primary_orig.png' WHERE id = 4;
UPDATE beneficiaries SET logo_file_name = '5_clt.jpg' WHERE id = 5;
UPDATE beneficiaries SET logo_file_name = '7_gri.jpg' WHERE id = 7;
UPDATE beneficiaries SET logo_file_name = '8_CITW_2010_RGB_(S).jpg' WHERE id = 8;
UPDATE beneficiaries SET logo_file_name = '9_kasanka.jpg' WHERE id = 9;
UPDATE beneficiaries SET logo_file_name = '10_Chipembele_logo_-_elipse.jpg' WHERE id = 10;
UPDATE beneficiaries SET logo_file_name = '11_zamcarn.jpg' WHERE id = 11;
UPDATE beneficiaries SET logo_file_name = '12_wcpp.png' WHERE id = 12;
UPDATE beneficiaries SET logo_file_name = '13_tcm.jpg' WHERE id = 13;
UPDATE beneficiaries SET logo_file_name = '14_munda.PNG' WHERE id = 14;
UPDATE beneficiaries SET logo_file_name = '15_birdwatch.jpg' WHERE id = 15;
UPDATE beneficiaries SET logo_file_name = '16_fzs.jpg' WHERE id = 16;
UPDATE beneficiaries SET logo_file_name = '17_projectluangwa.jpg' WHERE id = 17;
UPDATE beneficiaries SET logo_file_name = '18_lnp.jpg' WHERE id = 18;
