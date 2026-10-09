/* Liga o painel ao Supabase quando corre fora do claude.ai.
   Oferece à página a mesma interface que ela já usa (window.claude.use('db' | 'user' | 'downloads')),
   por isso o ficheiro painel/painel.html é o mesmo nas duas versões. */
(function(){
  var cfg=window.PAINEL_CFG||{},T='painel_docs',U='painel_utilizadores';
  var sb=null,cache={},subs={},pedidos={},eu=null,perfil=null,nomes={},pronto,resolver;
  pronto=new Promise(function(r){resolver=r});
  function el(id){return document.getElementById(id)}
  function caixa(html){
    var c=el('pa-entrada');
    if(!c){c=document.createElement('div');c.id='pa-entrada';c.setAttribute('role','dialog');c.setAttribute('aria-label','Entrar no painel');
      c.style.cssText='position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:#1E2B19;font-family:"Source Sans 3","Segoe UI",sans-serif';document.body.appendChild(c)}
    c.innerHTML='<div style="background:#fff;color:#22281C;border-radius:14px;padding:28px;max-width:380px;width:100%"><img src="logo.png" alt="We Garden" style="display:block;width:220px;max-width:80%;height:auto;margin:0 0 10px -6px"><div style="color:#5A5B5D;margin-bottom:18px">Painel da Administração</div>'+html+'</div>';
    return c;
  }
  function fechar(){var c=el('pa-entrada');if(c)c.remove()}
  var ES='width:100%;min-height:44px;border-radius:8px;border:1px solid #C9D2B8;padding:0 10px;font:inherit;margin:4px 0 12px;box-sizing:border-box';
  var BT='width:100%;min-height:44px;border-radius:8px;border:0;background:#4E6B16;color:#fff;font:inherit;font-weight:600;cursor:pointer';
  function entrada(msg){
    var c=caixa('<form id="pa-form"><label for="pa-email">Email</label><input id="pa-email" type="email" autocomplete="username" required style="'+ES+'"><label for="pa-pal">Palavra-passe</label><input id="pa-pal" type="password" autocomplete="current-password" style="'+ES+'"><button type="submit" style="'+BT+'">Entrar</button><button type="button" id="pa-link" style="'+BT+';background:none;color:#4E6B16;font-weight:400;margin-top:6px">Receber uma ligação de entrada por email</button><div id="pa-msg" role="status" style="margin-top:10px;color:#8A3F06">'+(msg||'')+'</div></form>');
    var m=el('pa-msg');
    el('pa-form').addEventListener('submit',function(e){e.preventDefault();m.textContent='A entrar…';
      sb.auth.signInWithPassword({email:el('pa-email').value.trim(),password:el('pa-pal').value}).then(function(r){if(r.error)m.textContent='Email ou palavra-passe errados.'})});
    el('pa-link').addEventListener('click',function(){var em=el('pa-email').value.trim();if(!em){m.textContent='Escreva primeiro o email.';return}m.textContent='A enviar…';
      sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}}).then(function(r){m.textContent=r.error?'Não foi possível enviar a ligação. Confirme o email.':'Ligação enviada. Abra o email neste dispositivo.'})});
  }
  function semAcesso(email){
    caixa('<p>O endereço <b>'+String(email).replace(/</g,'&lt;')+'</b> não tem acesso a este painel.</p><button type="button" id="pa-sair" style="'+BT+'">Sair</button>');
    el('pa-sair').addEventListener('click',function(){sb.auth.signOut()});
  }
  function botaoSair(){
    if(el('pa-sair-fixo'))return;var b=document.createElement('button');b.id='pa-sair-fixo';b.type='button';b.textContent='Sair';b.title=eu.email;
    b.style.cssText='position:fixed;right:12px;bottom:12px;z-index:50;min-height:36px;padding:0 14px;border-radius:8px;border:1px solid #C9D2B8;background:#fff;color:#22281C;font:inherit;cursor:pointer';
    b.addEventListener('click',function(){sb.auth.signOut().then(function(){location.reload()})});document.body.appendChild(b);
  }
  function sessao(s){
    if(!s){eu=null;perfil=null;entrada();return}
    if(eu&&eu.id===s.user.id)return;
    eu=s.user;
    sb.from(U).select('email,nome,pode_editar').then(function(r){
      var L=r.data||[],meu=(eu.email||'').toLowerCase();
      L.forEach(function(x){nomes[x.email.toLowerCase()]=x.nome||x.email});
      perfil=L.filter(function(x){return x.email.toLowerCase()===meu})[0]||null;
      if(!perfil){semAcesso(eu.email);return}
      fechar();botaoSair();resolver();
      sb.channel('painel').on('postgres_changes',{event:'*',schema:'public',table:T},function(p){var c=(p.new&&p.new.colecao)||(p.old&&p.old.colecao);if(c&&subs[c])carregar(c)}).subscribe();
      setInterval(function(){Object.keys(subs).forEach(carregar)},5*60*1000);
    });
  }
  function arrancar(){
    if(!window.supabase||!cfg.url||!cfg.chave){caixa('<p>Falta configurar a ligação à base de dados (ficheiro config.js).</p>');return}
    sb=window.supabase.createClient(cfg.url,cfg.chave);
    sb.auth.getSession().then(function(r){sessao(r.data&&r.data.session)});
    sb.auth.onAuthStateChange(function(ev,s){if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')sessao(s)});
  }
  // ---- dados ----
  function carregar(col){
    if(pedidos[col])return pedidos[col];
    pedidos[col]=sb.from(T).select('id,dados').eq('colecao',col).then(function(r){delete pedidos[col];if(r.error)throw r.error;cache[col]=r.data||[];avisar(col)},function(e){delete pedidos[col];throw e});
    return pedidos[col];
  }
  function avisar(col){(subs[col]||[]).slice().forEach(function(f){try{f()}catch(e){console.error(e)}})}
  function ouvir(col,f,erro){
    (subs[col]=subs[col]||[]).push(f);
    if(cache[col])setTimeout(f,0);else carregar(col).catch(function(e){if(erro)erro(e)});
    return function(){subs[col]=(subs[col]||[]).filter(function(x){return x!==f})};
  }
  function local(col,id,dados){
    var L=(cache[col]||[]).filter(function(x){return x.id!==id});if(dados)L.push({id:id,dados:dados});cache[col]=L;avisar(col);
  }
  function limpar(o){return JSON.parse(JSON.stringify(o))}
  function doc(col,id){
    function atual(){return (cache[col]||[]).filter(function(x){return x.id===id})[0]}
    function gravar(d){d=limpar(d);
      return sb.from(T).upsert({colecao:col,id:id,dados:d,atualizado_em:new Date().toISOString(),atualizado_por:eu&&eu.email}).then(function(r){if(r.error)throw r.error;local(col,id,d)})}
    return {
      id:id,
      onSnapshot:function(cb,erro){return ouvir(col,function(){var r=atual();cb({exists:!!r,id:id,data:function(){return r?r.dados:undefined}})},erro)},
      set:gravar,
      update:function(d){return sb.from(T).select('dados').eq('colecao',col).eq('id',id).maybeSingle().then(function(r){if(r.error)throw r.error;return gravar(Object.assign({},r.data?r.data.dados:{},d))})},
      delete:function(){return sb.from(T).delete().eq('colecao',col).eq('id',id).then(function(r){if(r.error)throw r.error;local(col,id,null)})}
    };
  }
  function consulta(col,o){
    o=o||{};
    return {
      orderBy:function(campo,sentido){return consulta(col,{ord:campo,desc:sentido==='desc',lim:o.lim})},
      limit:function(n){return consulta(col,{ord:o.ord,desc:o.desc,lim:n})},
      onSnapshot:function(cb,erro){return ouvir(col,function(){
        var L=(cache[col]||[]).slice();
        if(o.ord)L.sort(function(a,b){var x=a.dados[o.ord],y=b.dados[o.ord];return (x<y?-1:x>y?1:0)*(o.desc?-1:1)});
        if(o.lim)L=L.slice(0,o.lim);
        cb({docs:L.map(function(r){return {id:r.id,data:function(){return r.dados}}})})},erro)},
      doc:function(id){return doc(col,id)},
      add:function(d){var id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);return doc(col,id).set(d).then(function(){return {id:id}})}
    };
  }
  var db={collection:function(c){return consulta(c)},doc:function(p){var q=p.split('/');return doc(q[0],q.slice(1).join('/'))}};
  var user={
    id:function(){return eu.email},
    canEdit:function(){return !!(perfil&&perfil.pode_editar)},
    profiles:function(ids){var o={};ids.forEach(function(i){o[i]={name:nomes[String(i).toLowerCase()]||''}});return Promise.resolve(o)}
  };
  var downloads={save:function(o){
    var b=new Blob([o.data],{type:o.mime||'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=o.filename||'ficheiro';
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);return Promise.resolve();
  }};
  window.claude={use:function(n){return pronto.then(function(){return n==='db'?db:n==='user'?user:n==='downloads'?downloads:null})}};
  if(document.body)arrancar();else document.addEventListener('DOMContentLoaded',arrancar);
})();
