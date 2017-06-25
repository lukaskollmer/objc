#include <node.h>

#include "Proxy.h"
#include "Block.h"
#include "constants.h"
#include "utils.h"


namespace ObjC {

    static void GetConstant(const FunctionCallbackInfo<Value>& args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        const char* name = ValueToChar(isolate, args[0]);
        const char* bundle = args[1]->IsString() ? ValueToChar(isolate, args[1]) : NULL;

        const char* constant = GetConstantNamed(name, bundle);
        if (constant == NULL) {
            args.GetReturnValue().Set(Undefined(isolate));
        } else {
            args.GetReturnValue().Set(String::NewFromUtf8(isolate, constant));
        }
    }

    void Initialize(Local<Object> exports) {
        ObjC::Proxy::Init(exports);
        ObjC::Block::Init(exports);

        NODE_SET_METHOD(exports, "constant", GetConstant);
    }

    NODE_MODULE(objc, Initialize)
}
