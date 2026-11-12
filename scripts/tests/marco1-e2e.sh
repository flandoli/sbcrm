#!/usr/bin/env bash
# Testes ponta a ponta do Marco 1 (APIs reais, login NextAuth por credenciais).
set -u
B=http://localhost:3000
D=${TEST_TMP:-/tmp/fc_tests}; mkdir -p "$D"
PSQL="psql ${PSQL_ARGS:--h /home/ubuntu/.pgfc -p 5433 -U fc -d sbcrm} -tAc"
PASS=0; FAIL=0
ok() { echo "PASS  $1"; PASS=$((PASS+1)); }
ko() { echo "FAIL  $1 -> $2"; FAIL=$((FAIL+1)); }
check() { [ "$2" = "$3" ] && ok "$1" || ko "$1" "esperado $3, veio $2"; }

login() { # $1=jar $2=email $3=senha
  rm -f "$1"
  local csrf; csrf=$(curl -s -c "$1" -b "$1" $B/api/auth/csrf | jq -r .csrfToken)
  curl -s -o /dev/null -c "$1" -b "$1" -X POST $B/api/auth/callback/credentials \
    --data-urlencode "csrfToken=$csrf" --data-urlencode "email=$2" --data-urlencode "password=$3" --data-urlencode "json=true"
  grep -q session-token "$1" && echo yes || echo no
}
req() { # $1=jar $2=method $3=path [$4=body] → grava corpo em $D/out.json e imprime status
  curl -s -o $D/out.json -w "%{http_code}" -b "$1" -X "$2" -H 'Content-Type: application/json' ${4:+-d "$4"} "$B$3"
}

ADMIN_PW=$(grep ^SEED_ADMIN_PASSWORD ${ENV_FILE:-.env} | cut -d= -f2- | tr -d '"')
A=$D/admin.jar; V=$D/vend.jar; R=$D/dir.jar
check "login admin" "$(login $A admin@sbcrm.local "$ADMIN_PW")" yes

# ── US-01-01 usuários ──
$PSQL "DELETE FROM \"User\" WHERE email LIKE '%@teste.fc'" >/dev/null
check "criar vendedor" "$(req $A POST /api/admin/users '{"name":"Vendedor Teste","email":"vend@teste.fc","papel":"VENDEDOR","segmento":"VAREJO","password":"SenhaVend123"}')" 201
VID=$(jq -r .user.id $D/out.json)
check "criar diretor" "$(req $A POST /api/admin/users '{"name":"Diretora Teste","email":"dir@teste.fc","papel":"DIRETOR","segmento":null,"password":"SenhaDir1234"}')" 201
check "e-mail duplicado = 409" "$(req $A POST /api/admin/users '{"name":"Duplicado","email":"vend@teste.fc","papel":"VENDEDOR","segmento":null,"password":"SenhaVend123"}')" 409
check "senha curta = 400" "$(req $A POST /api/admin/users '{"name":"Y","email":"y@teste.fc","papel":"VENDEDOR","segmento":null,"password":"123"}')" 400
check "login vendedor" "$(login $V vend@teste.fc SenhaVend123)" yes
check "login diretor" "$(login $R dir@teste.fc SenhaDir1234)" yes
check "vendedor não lista usuários (403)" "$(req $V GET /api/admin/users)" 403
check "diretor não cria usuário (403)" "$(req $R POST /api/admin/users '{"name":"Z","email":"z@teste.fc","papel":"VENDEDOR","segmento":null,"password":"SenhaVend123"}')" 403
ADMIN_ID=$($PSQL "SELECT id FROM \"User\" WHERE email='admin@sbcrm.local'")
check "admin não se rebaixa (400)" "$(req $A PATCH /api/admin/users/$ADMIN_ID '{"papel":"VENDEDOR"}')" 400
check "admin não se desativa (400)" "$(req $A PATCH /api/admin/users/$ADMIN_ID '{"ativo":false}')" 400
check "desativar vendedor" "$(req $A PATCH /api/admin/users/$VID '{"ativo":false}')" 200
check "vendedor desativado perde API na hora (401)" "$(req $V GET /api/settings)" 401
check "vendedor desativado não loga" "$(login $V vend@teste.fc SenhaVend123)" no
check "reativar + trocar senha" "$(req $A PATCH /api/admin/users/$VID '{"ativo":true,"password":"NovaSenha12345"}')" 200
check "login com senha nova" "$(login $V vend@teste.fc NovaSenha12345)" yes

# ── US-01-02 etapas e transições ──
check "GET etapas" "$(req $A GET '/api/admin/stages?preset=v1')" 200
check "v1 tem 8 etapas" "$(jq '.stages|length' $D/out.json)" 8
check "nomes v1 na ordem validada" "$(jq -r '[.stages[].nome]|join("|")' $D/out.json)" "Prospecção|Qualificação|Diagnóstico/Apresentação|Teste/Piloto|Proposta Comercial|Negociação|Fechamento|Perda"
IDS=$(jq -c '[.stages[].id]' $D/out.json)
REV=$(jq -c '[.stages[].id] | [.[1],.[0]] + .[2:]' $D/out.json)
check "reordenar (troca 1ª e 2ª)" "$(req $A POST /api/admin/stages/reorder "{\"preset\":\"v1\",\"ids\":$REV}")" 200
req $A GET '/api/admin/stages?preset=v1' >/dev/null
check "ordem trocada" "$(jq -r '.stages[0].nome' $D/out.json)" "Qualificação"
check "reordenar de volta" "$(req $A POST /api/admin/stages/reorder "{\"preset\":\"v1\",\"ids\":$IDS}")" 200
check "lista incompleta = 400" "$(req $A POST /api/admin/stages/reorder '{"preset":"v1","ids":["x"]}')" 400
check "vendedor não reordena (403)" "$(req $V POST /api/admin/stages/reorder "{\"preset\":\"v1\",\"ids\":$IDS}")" 403
check "adicionar etapa" "$(req $A POST /api/admin/stages '{"preset":"v1","nome":"Etapa Teste"}')" 201
SID=$(jq -r .stage.id $D/out.json)
check "renomear etapa" "$(req $A PATCH /api/admin/stages/$SID '{"nome":"Etapa Renomeada"}')" 200
check "terminal sem resultado = 400" "$(req $A PATCH /api/admin/stages/$SID '{"terminal":true,"resultado":null}')" 400
check "desativar etapa" "$(req $A PATCH /api/admin/stages/$SID '{"ativo":false}')" 200
P1=$(jq -r '.stages[0].id' <(curl -s -b $A "$B/api/admin/stages?preset=v1"))
FECH=$(curl -s -b $A "$B/api/admin/stages?preset=v1" | jq -r '.stages[]|select(.nome=="Fechamento").id')
check "saída de etapa terminal = 400" "$(req $A PUT /api/admin/transitions "{\"preset\":\"v1\",\"transitions\":[{\"fromStageId\":null,\"toStageId\":\"$P1\",\"papeis\":[\"ADMIN\"]},{\"fromStageId\":\"$FECH\",\"toStageId\":\"$P1\",\"papeis\":[\"ADMIN\"]}]}")" 400
check "sem entrada = 400" "$(req $A PUT /api/admin/transitions "{\"preset\":\"v1\",\"transitions\":[{\"fromStageId\":\"$P1\",\"toStageId\":\"$FECH\",\"papeis\":[\"ADMIN\"]}]}")" 400
check "substituir grafo" "$(req $A PUT /api/admin/transitions "{\"preset\":\"v1\",\"transitions\":[{\"fromStageId\":null,\"toStageId\":\"$P1\",\"papeis\":[\"ADMIN\",\"VENDEDOR\"]},{\"fromStageId\":\"$P1\",\"toStageId\":\"$FECH\",\"papeis\":[\"DIRETOR\"]}]}")" 200
check "grafo com 2 transições" "$(jq '.transitions|length' $D/out.json)" 2
check "restaurar padrão" "$(req $A PUT /api/admin/transitions '{"preset":"v1","reset":true}')" 200
check "padrão v1 = 18 transições" "$(jq '.transitions|length' $D/out.json)" 18
check "trocar preset ativo p/ v2" "$(req $A PUT /api/settings '{"key":"funnel_preset","value":"v2"}')" 200
check "preset ativo = v2" "$(curl -s -b $A $B/api/admin/stages | jq -r .presetAtivo)" v2
req $A PUT /api/settings '{"key":"funnel_preset","value":"v1"}' >/dev/null

# ── US-01-03 origens e parceiros ──
check "criar parceiro" "$(req $A POST /api/admin/partners '{"nome":"Parceiro Teste","contato":"p@x.com","feePorc":12.5}')" 201
PID=$(jq -r .partner.id $D/out.json)
check "fee > 100 = 400" "$(req $A POST /api/admin/partners '{"nome":"Parceiro Ruim","feePorc":150}')" 400
check "origem PARCEIRO sem parceiro = 400" "$(req $A POST /api/admin/origins '{"nome":"Via parceiro","tipo":"PARCEIRO"}')" 400
check "origem PARCEIRO com parceiro" "$(req $A POST /api/admin/origins "{\"nome\":\"Via parceiro\",\"tipo\":\"PARCEIRO\",\"parceiroId\":\"$PID\"}")" 201
check "origem MIDIA descarta parceiro" "$(req $A POST /api/admin/origins "{\"nome\":\"Mídia paga\",\"tipo\":\"MIDIA\",\"parceiroId\":\"$PID\"}")" 201
check "  parceiroId = null" "$(jq -r .origin.parceiroId $D/out.json)" null
OID=$(jq -r .origin.id $D/out.json)
check "desativar origem" "$(req $A PATCH /api/admin/origins/$OID '{"ativo":false}')" 200
check "origem inativa fora do seletor" "$(curl -s -b $A "$B/api/admin/origins?ativos=1" | jq "[.origins[].id]|index(\"$OID\")")" null

# ── US-01-04 catálogos ──
check "27 UFs no seed" "$(curl -s -b $A "$B/api/admin/catalog?tipo=UF" | jq '.items|length')" 27
check "criar categoria" "$(req $A POST /api/admin/catalog '{"tipo":"CATEGORIA","nome":"Bebidas"}')" 201
CID=$(jq -r .item.id $D/out.json)
check "categoria duplicada = 409" "$(req $A POST /api/admin/catalog '{"tipo":"CATEGORIA","nome":"Bebidas"}')" 409
check "desativar categoria" "$(req $A PATCH /api/admin/catalog/$CID '{"ativo":false}')" 200
check "inativa some do seletor" "$(curl -s -b $A "$B/api/admin/catalog?tipo=CATEGORIA&ativos=1" | jq "[.items[].id]|index(\"$CID\")")" null
check "mas segue no histórico (lista completa)" "$(curl -s -b $A "$B/api/admin/catalog?tipo=CATEGORIA" | jq "[.items[].id]|index(\"$CID\") != null")" true

# ── US-01-05 DDD/DDI + reclassificação retroativa ──
$PSQL "DELETE FROM \"Lead\" WHERE source='teste_m1'" >/dev/null
$PSQL "INSERT INTO \"Lead\"(id,\"phoneNormalized\",ddi,ddd,source,status,\"statusManual\",\"updatedAt\") VALUES
 ('tl1','5511999990001','55','11','teste_m1','QUALIFICADO',false,now()),
 ('tl2','5521999990002','55','21','teste_m1','QUALIFICADO',false,now()),
 ('tl3','5521999990003','55','21','teste_m1','QUALIFICADO',true,now()),
 ('tl4','351912345678','351',null,'teste_m1','DDI_INDESEJADO',false,now())" >/dev/null
check "allowed_ddds=[11]" "$(req $A PUT /api/settings '{"key":"allowed_ddds","value":"[\"11\"]"}')" 200
check "  reclassificação devolvida" "$(jq '.reclassificacao.alterados >= 1' $D/out.json)" true
check "  DDD 11 segue QUALIFICADO" "$($PSQL "SELECT status FROM \"Lead\" WHERE id='tl1'")" QUALIFICADO
check "  DDD 21 automático vira DDD_INDESEJADO" "$($PSQL "SELECT status FROM \"Lead\" WHERE id='tl2'")" DDD_INDESEJADO
check "  DDD 21 manual preservado" "$($PSQL "SELECT status FROM \"Lead\" WHERE id='tl3'")" QUALIFICADO
check "allowed_ddis=[351]" "$(req $A PUT /api/settings '{"key":"allowed_ddis","value":"[\"351\"]"}')" 200
check "  DDI 351 liberado" "$($PSQL "SELECT status FROM \"Lead\" WHERE id='tl4'")" QUALIFICADO
check "DDD inválido = 400" "$(req $A PUT /api/settings '{"key":"allowed_ddds","value":"[\"1\"]"}')" 400
check "vendedor não altera settings (403)" "$(req $V PUT /api/settings '{"key":"capi_enabled","value":"true"}')" 403
check "capi_enabled segue false" "$(curl -s -b $A $B/api/settings | jq -r .capi_enabled)" false
req $A PUT /api/settings '{"key":"allowed_ddds","value":"[]"}' >/dev/null
req $A PUT /api/settings '{"key":"allowed_ddis","value":"[]"}' >/dev/null
check "  voltar ao padrão requalifica DDD 21" "$($PSQL "SELECT status FROM \"Lead\" WHERE id='tl2'")" QUALIFICADO

# ── US-01-06 alçadas ──
check "diretor grava alçadas" "$(req $R PUT /api/admin/discount-policy '{"items":[{"papel":"VENDEDOR","segmento":null,"tetoPorc":10},{"papel":"VENDEDOR","segmento":"VAREJO","tetoPorc":12},{"papel":"GERENTE","segmento":null,"tetoPorc":20}]}')" 200
check "  3 alterações" "$(jq .alterados $D/out.json)" 3
check "  reenviar igual = 0 alterações" "$(req $R PUT /api/admin/discount-policy '{"items":[{"papel":"VENDEDOR","segmento":null,"tetoPorc":10}]}' >/dev/null; jq .alterados $D/out.json)" 0
check "  null remove teto" "$(req $R PUT /api/admin/discount-policy '{"items":[{"papel":"GERENTE","segmento":null,"tetoPorc":null}]}' >/dev/null; jq '.policies|length' $D/out.json)" 2
check "  >100 = 400" "$(req $R PUT /api/admin/discount-policy '{"items":[{"papel":"VENDEDOR","segmento":null,"tetoPorc":101}]}')" 400
check "vendedor não grava alçadas (403)" "$(req $V PUT /api/admin/discount-policy '{"items":[{"papel":"VENDEDOR","segmento":null,"tetoPorc":90}]}')" 403
check "auditoria com valor anterior" "$($PSQL "SELECT \"valorAnterior\"->>'tetoPorc' FROM \"AuditLog\" WHERE acao='discount.update' AND \"entidadeId\"='GERENTE:TODOS' ORDER BY \"createdAt\" DESC LIMIT 1")" 20

# ── US-01-07 índices ──
check "diretor grava índice 25%" "$(req $R POST /api/admin/conversion-rates "{\"items\":[{\"stageId\":\"$P1\",\"segmento\":null,\"taxaPorc\":25}]}")" 200
check "diretor altera para 30%" "$(req $R POST /api/admin/conversion-rates "{\"items\":[{\"stageId\":\"$P1\",\"segmento\":null,\"taxaPorc\":30}]}")" 200
req $R GET /api/admin/conversion-rates >/dev/null
check "  vigente = 30" "$(jq ".vigentes[\"$P1:TODOS\"]" $D/out.json)" 30
check "  histórico com 2 linhas" "$(jq "[.historico[]|select(.stageId==\"$P1\")]|length" $D/out.json)" 2
check "  gravado como 0.3" "$($PSQL "SELECT taxa FROM \"StageConversionRate\" WHERE \"stageId\"='$P1' ORDER BY \"setadoEm\" DESC LIMIT 1")" 0.3000
check "  >100 = 400" "$(req $R POST /api/admin/conversion-rates "{\"items\":[{\"stageId\":\"$P1\",\"segmento\":null,\"taxaPorc\":120}]}")" 400
check "vendedor não grava índice (403)" "$(req $V POST /api/admin/conversion-rates "{\"items\":[{\"stageId\":\"$P1\",\"segmento\":null,\"taxaPorc\":99}]}")" 403

# ── Páginas ──
check "/admin para diretor = 200" "$(curl -s -o /dev/null -w '%{http_code}' -b $R $B/admin)" 200
check "/admin para vendedor redireciona" "$(curl -s -o /dev/null -w '%{http_code}' -b $V $B/admin)" 307
check "/admin sem login redireciona" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin)" 307
check "audit-log tem registros do Marco 1" "$($PSQL "SELECT count(DISTINCT acao) >= 12 FROM \"AuditLog\"")" t

# limpeza dos dados de teste (banco é novo; não deixar lixo)
$PSQL "DELETE FROM \"Lead\" WHERE source='teste_m1'; DELETE FROM \"Stage\" WHERE nome='Etapa Renomeada'; DELETE FROM \"StageConversionRate\"; DELETE FROM \"DiscountPolicy\"; DELETE FROM \"LeadOrigin\"; DELETE FROM \"Partner\"; DELETE FROM \"CatalogItem\" WHERE tipo='CATEGORIA'; DELETE FROM \"User\" WHERE email LIKE '%@teste.fc'" >/dev/null
echo "== $PASS passaram, $FAIL falharam =="
