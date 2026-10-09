'use strict';
// Test-only: allow loopback sockets exclusively, including undici/native fetch.
const net=require('net');const connect=net.Socket.prototype.connect;let denied=0;
net.Socket.prototype.connect=function(...args){
 const a=Array.isArray(args[0])?args[0]:args;
 const opts=typeof a[0]==='object'?a[0]:{host:typeof a[1]==='string'?a[1]:'localhost'};
 const host=opts.host||'localhost';
 if(opts.path||!['localhost','127.0.0.1','::1'].includes(host)){denied++;throw Error('TEST_EXTERNAL_NETWORK_DENIED');}
 return connect.apply(this,args);
};
process.on('exit',()=>console.log('NETWORK_GUARD '+JSON.stringify({externalAttempts:denied})));
