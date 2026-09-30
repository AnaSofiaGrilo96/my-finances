-- Importação Organizze — passo 01/10: limpeza, contas e categorias.
-- ATENÇÃO: apaga todos os dados existentes do utilizador. Correr os ficheiros desta pasta por ordem (01, 02, ...), um de cada vez, no SQL Editor.
do $$
declare uid uuid;
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Esperava exatamente 1 utilizador em auth.users.';
  end if;
  select id into uid from auth.users order by created_at limit 1;
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Esperava exatamente 1 utilizador em auth.users; ajusta a linha "select id into uid" abaixo.';
  end if;
  select id into uid from auth.users order by created_at limit 1;

  delete from public.transactions where user_id = uid;
  delete from public.categories   where user_id = uid;
  delete from public.accounts     where user_id = uid;

  -- Contas
  insert into public.accounts (id, user_id, name, type, color, icon, initial_balance, sort_order) values
    ('4dedb03e-db4a-570c-936d-5c5cd3feba65', uid, 'MOEY!', 'checking', '#00c853', 'account_balance_wallet', 0, 0),
    ('f8e6a815-7288-5ccf-a52a-ed83578a2374', uid, 'MOEY - Poupanças', 'savings', '#ef5350', 'savings', 0, 1),
    ('ea1a49db-b2c2-5868-bb8a-ad62af04526a', uid, 'Crédito Agricola', 'checking', '#ffa726', 'account_balance', 0, 2),
    ('2581b187-151e-5977-9792-f98bf43e353f', uid, 'Numerário', 'cash', '#ffca28', 'payments', 0, 3),
    ('7906e07c-209a-5b15-83e7-2ddbd464f436', uid, 'Trading 212 - Juros', 'savings', '#66bb6a', 'savings', 0, 4),
    ('b1478394-02a7-51aa-9fc9-2b33cd95ca63', uid, 'Trading 212 - Investimentos', 'investment', '#1e88e5', 'trending_up', 0, 5);

  -- Categorias (primeiro as principais, depois as sub-categorias)
  insert into public.categories (id, user_id, name, kind, color, icon, parent_id, archived, sort_order) values
    ('e462b050-0678-5739-aa3f-9fb380ca2dde', uid, 'Alimentação', 'expense', '#e57399', 'restaurant', null, false, 0),
    ('aab02460-e083-5d28-8443-1cdf3d99dba2', uid, 'Marmitas', 'expense', '#e57399', 'restaurant', 'e462b050-0678-5739-aa3f-9fb380ca2dde', false, 0),
    ('06ef132c-ca90-54fe-8ffa-4c1be7d22474', uid, 'Supermercado', 'expense', '#e57399', 'restaurant', 'e462b050-0678-5739-aa3f-9fb380ca2dde', false, 1),
    ('cfe04183-ea7d-59ae-926a-a9be22769269', uid, 'Animais', 'expense', '#ffa726', 'pets', null, false, 1),
    ('7c3a917d-cd8e-52ac-80de-9cb60d8b3e9d', uid, 'Assinaturas e serviços', 'expense', '#ab47bc', 'subscriptions', null, false, 2),
    ('ad9fb933-f378-5f5b-bbf1-bdd1107eeee5', uid, 'Beleza/Estética', 'expense', '#ef5350', 'face', null, false, 3),
    ('74c55c28-7826-572b-88cb-4aee82eb8d1a', uid, 'Cabeleireiro', 'expense', '#ef5350', 'face', 'ad9fb933-f378-5f5b-bbf1-bdd1107eeee5', false, 0),
    ('b1224b36-3c9b-59b2-afac-99bdba2982b4', uid, 'Depilação', 'expense', '#ef5350', 'face', 'ad9fb933-f378-5f5b-bbf1-bdd1107eeee5', false, 1),
    ('ff5a36c7-84ef-5bf1-9d8c-9ba08b66c92a', uid, 'Unhas', 'expense', '#ef5350', 'face', 'ad9fb933-f378-5f5b-bbf1-bdd1107eeee5', false, 2),
    ('50f7dcb0-747f-549a-b082-c514413b6ea3', uid, 'Cafés/Bares e restaurantes', 'expense', '#5c6bc0', 'local_cafe', null, false, 4),
    ('6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', uid, 'Casa', 'expense', '#7986cb', 'home', null, false, 5),
    ('aba68af7-bbb9-51a5-96e2-0ff2ff244923', uid, 'Créditos', 'expense', '#7986cb', 'home', '6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', false, 0),
    ('b77cc082-57a3-5a38-9487-1ea23d30479b', uid, 'Eletricidade', 'expense', '#7986cb', 'home', '6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', false, 1),
    ('30d41af7-844c-5e5a-aca2-9686dc39c56e', uid, 'Fornecimento de Água', 'expense', '#7986cb', 'home', '6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', false, 2),
    ('5e403bec-19db-59a8-a70f-d53ac8e61e98', uid, 'Impostos', 'expense', '#7986cb', 'home', '6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', false, 3),
    ('c322cabc-76b8-5473-8164-3a6fc3d79ad9', uid, 'Seguro Vida', 'expense', '#7986cb', 'home', '6a57a6ee-c3ef-5a36-85c1-3ccc1a535773', false, 4),
    ('d43ece3e-5a5d-5a3b-898b-d875fb91f1d0', uid, 'Compras', 'expense', '#e040fb', 'shopping_bag', null, false, 6),
    ('db1ac111-a073-5306-bd5e-b976c206dff9', uid, 'Impressões fotográficas', 'expense', '#e040fb', 'shopping_bag', 'd43ece3e-5a5d-5a3b-898b-d875fb91f1d0', false, 0),
    ('03c44782-2b6b-598f-b4de-243e675dfe3a', uid, 'Informática', 'expense', '#e040fb', 'shopping_bag', 'd43ece3e-5a5d-5a3b-898b-d875fb91f1d0', false, 1),
    ('9bd4b6bd-bad8-55bf-a8bb-8ec6339fbf6a', uid, 'Material Fotográfico', 'expense', '#e040fb', 'shopping_bag', 'd43ece3e-5a5d-5a3b-898b-d875fb91f1d0', false, 2),
    ('4290602f-2f60-57bd-969c-6297a4647ee5', uid, 'Dívidas e empréstimos', 'expense', '#e53935', 'request_quote', null, false, 7),
    ('37608406-cf49-55c5-badf-754475936f77', uid, 'Impostos e Taxas', 'expense', '#ff7043', 'percent', null, false, 8),
    ('dd174bbe-3255-5b7b-85fe-4157d170a3bb', uid, 'Investimentos', 'expense', '#ec407a', 'trending_up', null, false, 9),
    ('cd4e6801-ffa3-5102-ac74-967b5db52ee7', uid, 'Lazer e hobbies', 'expense', '#9ccc65', 'sports_esports', null, false, 10),
    ('5882ebad-eddf-52bb-83fa-dff5f67227b7', uid, 'Outros', 'expense', '#90a4ae', 'more_horiz', null, false, 11),
    ('d35aba92-0c4d-5e49-b12e-aa1410ad1441', uid, 'Presentes e doações', 'expense', '#5e35b1', 'card_giftcard', null, false, 12),
    ('0b245d9a-6b8e-5ac8-a3ee-7f1b3e3966f7', uid, 'Roupas', 'expense', '#ff7043', 'checkroom', null, false, 13),
    ('ed481467-44f8-578b-8e2d-d93af8920d79', uid, 'Saúde', 'expense', '#42a5f5', 'medical_services', null, false, 14),
    ('bc5eea09-875b-58ac-be62-d779533ddb85', uid, 'Consultas Nutrição', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 0),
    ('be499359-eb31-5ffe-bf56-891828c309d2', uid, 'Consultas Psicologia', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 1),
    ('75baa877-c894-5d41-b589-1978c33fddc5', uid, 'Dentista', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 2),
    ('cbb90282-3176-59ac-93ab-80a82380e7d9', uid, 'Farmacia', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 3),
    ('2c71b11c-3448-5c43-8fa9-5032a19eb6bc', uid, 'Ginásio/Desporto', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 4),
    ('8273d087-f70f-5a80-b5a0-f222139b7438', uid, 'Outras Consultas/Exames', 'expense', '#42a5f5', 'medical_services', 'ed481467-44f8-578b-8e2d-d93af8920d79', false, 5),
    ('06bc1baf-3150-584d-ace3-e9949220e46f', uid, 'Transporte', 'expense', '#4fc3f7', 'directions_bus', null, false, 15),
    ('450c85a1-8002-5910-887f-ddc7593167ea', uid, 'Combustível', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 0),
    ('2b6ebf30-f0f3-57fb-b589-2924608e646d', uid, 'Estacionamento', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 1),
    ('327f30d3-09b7-506d-9bde-ed85f9a1d836', uid, 'Inspeção', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 2),
    ('d11096d5-653c-5444-b89e-f6a67422fae8', uid, 'IUC', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 3),
    ('f3965c9f-6a41-51ec-8ab6-a8a593d41abc', uid, 'Manutenções', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 4),
    ('087e033e-8583-5580-98dc-9c194a884043', uid, 'Mensalidade', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 5),
    ('04977ea6-62ed-5cb8-b148-74dafeb2e218', uid, 'Multas', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 6),
    ('aae6845b-6296-5777-a396-eb21f3e94bc5', uid, 'Portagens', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 7),
    ('83f914c4-b512-5439-bfe6-95c42d975cd9', uid, 'Seguro', 'expense', '#4fc3f7', 'directions_bus', '06bc1baf-3150-584d-ace3-e9949220e46f', false, 8),
    ('46839344-8764-5a5e-b995-13b06a824043', uid, 'Viagem', 'expense', '#ec407a', 'flight', null, false, 16),
    ('2b234045-298a-50a4-a64d-b1a98e26a2ed', uid, 'Educação', 'expense', '#26a69a', 'school', null, true, 17),
    ('ea73e38f-bdc3-59f9-89ff-eefec1f7419e', uid, 'Empréstimos', 'income', '#26c6da', 'attach_money', null, false, 0),
    ('0da80e96-8b4d-5d48-9a6d-06fa74dabb5a', uid, 'Investimentos', 'income', '#26c6da', 'trending_up', null, false, 1),
    ('2998d79d-8c0f-53db-909d-94dea928c670', uid, 'Outras receitas', 'income', '#1de9b6', 'more_horiz', null, false, 2),
    ('2ae6c2e8-ec76-56aa-a67b-4651bb8f5979', uid, 'Outros', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 0),
    ('573dbdfb-5687-5a81-9c4d-96c3ce8339bb', uid, 'Prémios', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 1),
    ('d288b8ba-e656-5e95-b326-a675d35a8313', uid, 'Presentes', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 2),
    ('ff90d2b8-01b7-5725-967b-63c060c69633', uid, 'Reembolso IRS', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 3),
    ('71faf7d4-1505-5bec-b3d6-b58573903584', uid, 'Reembolsos Seguro Saúde', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 4),
    ('bd51e046-f070-5c7a-aa7b-6da16eb696c1', uid, 'Trabalhos fotográficos', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 5),
    ('70046751-f368-5bc2-8412-23f82ff4d96b', uid, 'Vendas', 'income', '#1de9b6', 'more_horiz', '2998d79d-8c0f-53db-909d-94dea928c670', false, 6),
    ('b99098e7-f7bc-5533-bc3a-aae8202cc058', uid, 'Salário', 'income', '#26c6da', 'star', null, false, 3);

end $$;
