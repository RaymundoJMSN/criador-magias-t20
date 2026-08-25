# deploy/deploy.ps1 — sobe pro devilsworks e reinicia.
# Primeira vez no servidor (uma vez só):
#   ssh devilsworks 'sudo cp /home/ubuntu/criador-magias/deploy/criador-magias.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now criador-magias'
#   nginx: server_name magias.raynathus.com.br -> proxy_pass http://127.0.0.1:8070; depois sudo certbot --nginx -d magias.raynathus.com.br
#   (DNS: criar A/CNAME "magias" no raynathus.com.br antes do certbot)
$proj = Split-Path $PSScriptRoot -Parent
ssh devilsworks 'mkdir -p /home/ubuntu/criador-magias/static /home/ubuntu/criador-magias/data /home/ubuntu/criador-magias/deploy /home/ubuntu/criador-magias/dados'
scp (Join-Path $proj 'server.mjs') devilsworks:/home/ubuntu/criador-magias/
scp -r (Join-Path $proj 'static') devilsworks:/home/ubuntu/criador-magias/
scp -r (Join-Path $proj 'data') devilsworks:/home/ubuntu/criador-magias/
scp (Join-Path $proj 'deploy/criador-magias.service') devilsworks:/home/ubuntu/criador-magias/deploy/
# textos oficiais (local-only, nunca no git); só estes arquivos — estado.json dos usuários fica intacto
foreach ($f in 'dados/textos.json', 'dados/aprimoramentos.json') {
  if (Test-Path (Join-Path $proj $f)) { scp (Join-Path $proj $f) devilsworks:/home/ubuntu/criador-magias/dados/ }
}
ssh devilsworks 'sudo systemctl restart criador-magias && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8070/'
