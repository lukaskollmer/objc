'use strict';

/**
 * NOTE: This example doesn't work since the reply block will be called on a different thread
 */

const ffi = require('ffi-napi');
const objc = require('../src/index.js');

objc.import('LocalAuthentication');
const {LAContext} = objc;

const c = new ffi.Library(null, {
  'dispatch_semaphore_create': ['pointer', ['long']],
  'dispatch_semaphore_wait':   ['long', ['pointer', 'long']],
  'dispatch_semaphore_signal': ['long', ['pointer']]
});

const LAPolicyDeviceOwnerAuthenticationWithBiometrics = 1;
const context = LAContext.new();

console.log(context.canEvaluatePolicy_error_(LAPolicyDeviceOwnerAuthenticationWithBiometrics, null));

let sema = c.dispatch_semaphore_create(0);


const HandlerType = objc.defineBlock('v@c@');

const handler = new HandlerType((success, err) => {
  console.log('handler');
  c.dispatch_semaphore_signal(sema);
});

console.log(objc.NSThread.currentThread());
context.evaluatePolicy_localizedReason_reply_(LAPolicyDeviceOwnerAuthenticationWithBiometrics, 'HEY', handler);


c.dispatch_semaphore_wait(sema, Number.MAX_VALUE);
