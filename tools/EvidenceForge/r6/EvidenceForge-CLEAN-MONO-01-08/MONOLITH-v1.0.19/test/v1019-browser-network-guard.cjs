'use strict';
require('./v1018-network-guard.cjs');
// Fresh headless profiles only; external browser requests go to an unreachable loopback proxy.
const cp=require('child_process'),spawn=cp.spawn;
cp.spawn=function(file,args,options){
 if(String(file).includes('Google Chrome')) args=[...args,'--disable-background-networking','--disable-component-update','--disable-sync','--disable-quic','--no-first-run','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]'];
 return spawn.call(this,file,args,options);
};
