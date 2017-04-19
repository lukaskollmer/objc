//
// Created by Lukas Kollmer on 17.04.17.
//

#include <node.h>
#include <string>
#include <iostream>
#include <mach-o/dyld.h>
#include <array>
#include "Proxy.h"
#include "objc_call.h"

#include "Invocation.h"
#include "utils.h"

extern "C" {
#include <objc/message.h>
#include <objc/runtime.h>
}


SEL resolveSelector(id target, const char *sel) {
    std::string selector(sel);

    std::replace(selector.begin(), selector.end(), '_', ':'); // TODO make this smart and support methods that include an unserscore
    return sel_getUid(selector.c_str());
}


#define HANDLE_RETURN_TYPE(type) \
    type retval; \
    invocation.GetReturnValue(&retval); \
    args.GetReturnValue().Set(retval); \
    return; \

#define HANDLE_RETURN_TYPE_CAST(type, castType) \
    type retval; \
    invocation.GetReturnValue(&retval); \
    args.GetReturnValue().Set((castType)retval); \
    return; \




using namespace v8;

namespace ObjC {

    Persistent<Function> Proxy::constructor;

    Proxy::Proxy(enum Type type, id obj) : type_(type), obj_(obj) {}
    Proxy::~Proxy() {}

    void Proxy::Init(Local<Object> exports) {
        Isolate *isolate = exports->GetIsolate();
        HandleScope scope(isolate);

        Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
        tpl->SetClassName(String::NewFromUtf8(isolate, "Proxy"));
        tpl->InstanceTemplate()->SetInternalFieldCount(1);

        NODE_SET_PROTOTYPE_METHOD(tpl, "call", Call);
        NODE_SET_PROTOTYPE_METHOD(tpl, "description", Description);
        NODE_SET_PROTOTYPE_METHOD(tpl, "type", Type);
        NODE_SET_PROTOTYPE_METHOD(tpl, "returnTypeOfMethod", ReturnTypeOfMethod);


        constructor.Reset(isolate, tpl->GetFunction());
        exports->Set(String::NewFromUtf8(isolate, "Proxy"), tpl->GetFunction());
    }


    void Proxy::New(const FunctionCallbackInfo<Value>& args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        id object;

        enum Type type = static_cast<enum Type>(args[0]->Int32Value());
        switch (type) {
            case Type::klass: {
                auto classname = ValueToChar(isolate, args[1]);
                object = (id)objc_getClass(classname);
                if (object == NULL) {
                    char *excMessage;
                    asprintf(&excMessage, "Error: Class with name '%s' doesn't exist", classname);
                    isolate->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8(isolate, excMessage)));
                    free(excMessage);
                    return;
                }
                break;
            }
            case Type::instance: {
                object = (id)args[1]->ToObject()->GetAlignedPointerFromInternalField(0);
                break;
            }
        }

        Proxy *proxy = new Proxy(type, object);
        proxy->Wrap(args.This());

        args.GetReturnValue().Set(args.This());


    }

    void Proxy::Type(const FunctionCallbackInfo<Value> &args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());

        int type = static_cast<int>(obj->type_);

        args.GetReturnValue().Set(type);
    }

    void Proxy::Description(const FunctionCallbackInfo<Value> &args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Proxy *object = ObjectWrap::Unwrap<Proxy>(args.This());

        id description = objc_call(id, object->obj_, "description");
        char *desc = objc_call(char*, description, "UTF8String");

        args.GetReturnValue().Set(String::NewFromUtf8(isolate, desc));

    }

    void Proxy::Call(const FunctionCallbackInfo<Value>& args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Local<ObjectTemplate> TemplateObject = ObjectTemplate::New();
        TemplateObject->SetInternalFieldCount(1);



        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());

        SEL sel = resolveSelector(obj->obj_, ValueToChar(isolate, args[0]));

        Method method;

        switch (obj->type_) {
            case Type::klass: method = class_getClassMethod((Class)obj->obj_, sel); break;
            case Type::instance: method = class_getInstanceMethod(object_getClass(obj->obj_), sel); break;
        }


        auto invocation = ObjC::Invocation(obj->obj_, sel);
        invocation.SetTarget(obj->obj_);
        invocation.SetSelector(sel);


        for (int i = 1; i < args.Length(); ++i) {
            int objcArgumentIndex = i + 1; // +1 bc we already start at 1

            auto expectedType = method_copyArgumentType(method, (unsigned int) objcArgumentIndex);
            Local<Value> arg = args[i];

            if (arg->IsNull() || arg->IsUndefined()) {
                void* nilArgument = nullptr;
                invocation.SetArgumentAtIndex(&nilArgument, objcArgumentIndex);
                continue;
            }


            if (EQUAL(expectedType, "@")) {
                // 1. check if a wrapped object was passed
                if (arg->IsObject()) {
                    // args[i] is the JS Proxy type, we have to fetch the actual ObjC::Proxy wrapper via __ptr
                    Local<Object> wrappedObject = arg->ToObject()->Get(String::NewFromUtf8(isolate, "__ptr"))->ToObject();

                    Proxy *passedProxy = ObjectWrap::Unwrap<Proxy>(wrappedObject);
                    if (passedProxy != nullptr) {
                        id argument = passedProxy->obj_;
                        invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
                        continue;
                    } else {
                        // TODO set nil as arg
                    }
                // 2. if no wrapped object was passed, but a native type (string, number, bool), convert that
                } else if (arg->IsString()) {
                    const char* stringValue = ValueToChar(isolate, arg);

                    id NSString = (id)objc_getClass("NSString");
                    id string = objc_call(id, NSString, "stringWithUTF8String:", stringValue);

                    invocation.SetArgumentAtIndex(&string, objcArgumentIndex);
                } else if (arg->IsNumber()) {
                    double numberValue = arg->ToNumber()->Value();

                    id NSNumber = (id)objc_getClass("NSNumber");
                    id number = objc_call(id, NSNumber, "numberWithDouble:", numberValue);

                    invocation.SetArgumentAtIndex(&number, objcArgumentIndex);
                } else if (arg->IsBoolean()) {
                    bool boolValue = arg->ToBoolean()->Value();

                    id NSNumber = (id)objc_getClass("NSNumber");
                    id number = objc_call(id, NSNumber, "numberWithBool:", boolValue);

                    invocation.SetArgumentAtIndex(&number, objcArgumentIndex);
                } // TODO Convert array/dict as well?
            }
        }


        //
        // Invoke
        //

        invocation.Invoke();



        //
        // Handle return value
        //

        const char *returnType = method_copyReturnType(method);

        if (EQUAL(returnType, "@")) {
            id retval;
            invocation.GetReturnValue(&retval);

            auto isKindOfClass = [](id object, const char *classname) -> bool {
                return false; // TODO Re-enable this
                return objc_call(bool, object, "isKindOfClass:", objc_getClass(classname));
            };

            if (isKindOfClass(retval, "NSString")) {
                char *charValue = objc_call(char*, retval, "UTF8String");
                args.GetReturnValue().Set(String::NewFromUtf8(isolate, charValue));
                return;
            }

            if (isKindOfClass(retval, "NSNumber")) {
                double value = objc_call(double, retval, "doubleValue");
                args.GetReturnValue().Set(value);
                return;
            }

            // TODO convert other types like NSArray, NSDictionary, NSURL, etc to native objects

            Local<Object> object = TemplateObject->NewInstance();
            object->SetAlignedPointerInInternalField(0, retval);
            // TODO ^^ This sometimes crashes w/ a "pointer not aligned" error message (seems to happem at random, try to fix eventually)

            const unsigned argc = 2;
            Local<Value> argv[argc] = {Number::New(isolate, 1), object};
            Local<Function> cons = Local<Function>::New(isolate, constructor);
            Local<Context> context = isolate->GetCurrentContext();
            Local<Object> instance = cons->NewInstance(context, argc, argv).ToLocalChecked();
            args.GetReturnValue().Set(instance);
            return;
        } else if (EQUAL(returnType, "c")) { // char
            HANDLE_RETURN_TYPE(char);
        } else if (EQUAL(returnType, "i")) { // int
            HANDLE_RETURN_TYPE(int);
        } else if (EQUAL(returnType, "s")) { // short
            HANDLE_RETURN_TYPE(short);
        } else if (EQUAL(returnType, "q")) { // long long
            HANDLE_RETURN_TYPE_CAST(long long, int32_t);
        } else if (EQUAL(returnType, "C")) { // unsigned char
            HANDLE_RETURN_TYPE(unsigned char);
        } else if (EQUAL(returnType, "I")) { // unsigned int
            HANDLE_RETURN_TYPE(unsigned int);
        } else if (EQUAL(returnType, "S")) { // unsigned short
            HANDLE_RETURN_TYPE(unsigned short);
        } else if (EQUAL(returnType, "L")) { // unsigned long
        } else if (EQUAL(returnType, "Q")) { // unsigned long long
            HANDLE_RETURN_TYPE_CAST(unsigned long long, int32_t);
        } else if (EQUAL(returnType, "f")) { // float
            HANDLE_RETURN_TYPE(float);
        } else if (EQUAL(returnType, "d")) { // double
            HANDLE_RETURN_TYPE(double);
        } else if (EQUAL(returnType, "B")) { // bool
            HANDLE_RETURN_TYPE(bool);
            //void* retval;
            //invocation.GetReturnValue(&retval);
            //args.GetReturnValue().Set((bool)retval);
            //return;
        } else if (EQUAL(returnType, "v")) { // void
            args.GetReturnValue().Set(Undefined(isolate));
        } else if (EQUAL(returnType, "*")) { // char*
            char* retval;
            invocation.GetReturnValue(&retval);
            Local<Value>  string = String::NewFromUtf8(isolate, retval);
            args.GetReturnValue().Set(string);
            return;
        } else if (EQUAL(returnType, "#")) { // Class
            // TODO
            args.GetReturnValue().Set(Undefined(isolate));
        } else if (EQUAL(returnType, ":")) { // SEL
            // TODO
            args.GetReturnValue().Set(Undefined(isolate));
        }

        return;
    }

    void Proxy::ReturnTypeOfMethod(const FunctionCallbackInfo<Value> &args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());
        SEL sel = resolveSelector(obj->obj_, ValueToChar(isolate, args[0]));

        Method method;

        switch (obj->type_) {
            case Type::klass: method = class_getClassMethod((Class)obj->obj_, sel); break;
            case Type::instance: method = class_getInstanceMethod(object_getClass(obj->obj_), sel); break;
        }

        const char *returnType = method_copyReturnType(method);

        args.GetReturnValue().Set(String::NewFromUtf8(isolate, returnType));
    }
}
