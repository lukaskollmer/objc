//
// Created by Lukas Kollmer on 17.04.17.
//

#ifndef OBJC_PROXY_H
#define OBJC_PROXY_H

#include <v8.h>
#include <node_object_wrap.h>

extern "C" {
#include <objc/runtime.h>
#include <Block.h>
};

using namespace v8;
using node::ObjectWrap;

namespace ObjC {
    class Proxy : public ObjectWrap {

    public:
        enum class Type { klass, instance };

        Proxy(Type type, id obj);
        static void Init(Local<Object> exports);
        static void New(const FunctionCallbackInfo<Value>& args);

        static void Call(const FunctionCallbackInfo<Value>& args);
        static void ReturnTypeOfMethod(const FunctionCallbackInfo<Value>& args);

        static void Type(const FunctionCallbackInfo<Value>& args);
        static void Description(const FunctionCallbackInfo<Value>& args);
        static void IsNil(const FunctionCallbackInfo<Value> &args);

        static void Methods(const FunctionCallbackInfo<Value> &args);
        static void HasMethod(const FunctionCallbackInfo<Value> &args);

        static Local<Object> CreateNewObjCWrapperFrom(Isolate* isolate, id obj);

        id GetWrappedObject() { return obj_; }

    private:
        ~Proxy();

        enum Type type_;
        id obj_;

        static Persistent<Function> constructor;
    };
}


#endif //OBJC_PROXY_H
