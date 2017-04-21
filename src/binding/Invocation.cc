//
// Created by Lukas Kollmer on 18.04.17.
//

#include "Invocation.h"
#include "objc_call.h"



const char *ObjC::description(id object, bool debug) {
    const char *sel = debug ? "debugDescription" : "description";
    id description = objc_call(id, object, sel);
    return objc_call(char*, description, "UTF8String");
}

ObjC::Invocation::Invocation(id target, SEL selector) {
    this->target_ = target;
    this->selector_ = selector;

    Class NSInvocation = objc_getClass("NSInvocation");


    id methodSignature = objc_call(id, target, "methodSignatureForSelector:", selector);

    this->invocation_ = objc_call(id, (id)NSInvocation, "invocationWithMethodSignature:", methodSignature);
    objc_call_noreturn(void, this->invocation_, "setSelector:", selector);
    objc_call_noreturn(void, this->invocation_, "setTarget:", target);
}

ObjC::Invocation::~Invocation() {
    // TODO release objects???
}

void ObjC::Invocation::SetArgumentAtIndex(void *arg, int index) {
    objc_call_noreturn(void, this->invocation_, "setArgument:atIndex:", arg, index); // TODO test
}

void ObjC::Invocation::GetArgumentAtIndex(void *arg, int index) {
    objc_call_noreturn(void, this->invocation_, "getArgument:atIndex:", arg, index); // TODO test
}

void ObjC::Invocation::Invoke() {
    objc_call_noreturn(void, this->invocation_, "invoke"); // TODO test
}

void ObjC::Invocation::InvokeWithTarget(id target) {
    objc_call_noreturn(void, this->invocation_, "invokeWithTarget:", target); // TODO test
}

bool ObjC::Invocation::ArgumentAreRetained() {
    return objc_call(bool, this->invocation_, "argumentsRetained"); // TODO test
}

void ObjC::Invocation::RetainArguments() {
    objc_call_noreturn(void, this->invocation_, "retainArguments"); // TODO test
}

void ObjC::Invocation::SetReturnValue(void *retval) {
    objc_call_noreturn(void, this->invocation_, "setReturnValue:", retval); // TODO test
}

void ObjC::Invocation::GetReturnValue(void* retval) {
    objc_call_noreturn(void, this->invocation_, "getReturnValue:", retval); // TODO test
}

id ObjC::Invocation::GetMethodSignature() {
    return objc_call(id, this->invocation_, "methodSignature"); // TODO test
}