#include <node.h>

#include "Proxy.h"
//#include "ClassProxy.h"

namespace ObjC {


    using v8::FunctionCallbackInfo;
    using v8::Isolate;
    using v8::Local;
    using v8::Object;
    using v8::String;
    using v8::Value;


    void Initialize(Local<Object> exports) {
        //ObjC::ClassProxy::Init(exports);
        ObjC::Proxy::Init(exports);

    }

    NODE_MODULE(objc, Initialize)
}