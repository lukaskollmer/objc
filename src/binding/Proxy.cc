//
// Created by Lukas Kollmer on 17.04.17.
//

#include <node.h>
#include "Proxy.h"
#include "objc_call.h"

#include "utils.h"

extern "C" {
#include <objc/message.h>
#include <objc/runtime.h>
}

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
        //printf("%s\n", __PRETTY_FUNCTION__);

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

#define UNSUPPORTED_RETURN_TYPE(type) \
    char *excMessage; \
    asprintf(&excMessage, "Return type '%s'not yet supported", returnType); \
    isolate->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8(isolate, excMessage))); \
    free(excMessage); \

    void Proxy::Call(const FunctionCallbackInfo<Value>& args) {
        //printf("%s\n", __PRETTY_FUNCTION__);
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        const char *sel = ValueToChar(isolate, args[0]);

        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());


        // arguments TODO

        //int argc = args.Length() - 1; // 1st arg is selector
        //for (int i = 1; i <= argc; ++i) {
        //    printf("#arg: %i %p\n", i, args[i]);
        //}

        Method method;

        switch (obj->type_) {
            case Type::klass: method = class_getClassMethod((Class)obj->obj_, sel_getUid(sel)); break;
            case Type::instance: method = class_getInstanceMethod(object_getClass(obj->obj_), sel_getUid(sel)); break;
        }


        char *returnType = method_copyReturnType(method);

        if (EQUAL(returnType, "@")) {
            id retval = objc_call(id, obj->obj_, sel);

            auto isKindOfClass = [](id object, const char *classname) -> bool {
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
            // NSData -> Buffer???


            Local<ObjectTemplate> TemplateObject = ObjectTemplate::New();
            TemplateObject->SetInternalFieldCount(1);

            Local<Object> object = TemplateObject->NewInstance();
            object->SetAlignedPointerInInternalField(0, retval);

            const unsigned argc = 2;
            Local<Value> argv[argc] = {Number::New(isolate, 1), object};
            Local<Function> cons = Local<Function>::New(isolate, constructor);
            Local<Context> context = isolate->GetCurrentContext();
            Local<Object> instance =
                    cons->NewInstance(context, argc, argv).ToLocalChecked();

            args.GetReturnValue().Set(instance);
            return;
        } else if (EQUAL(returnType, "c")) { // char
            UNSUPPORTED_RETURN_TYPE(returnType);
            return;
        } else if (EQUAL(returnType, "i")) { // int
            int retval = objc_call(int, obj->obj_, sel);
            args.GetReturnValue().Set(retval);
            return;
        } else if (EQUAL(returnType, "s")) { // short
            UNSUPPORTED_RETURN_TYPE(returnType);
            return;
        } else if (EQUAL(returnType, "l")) { // A longl is treated as a 32-bit quantity on 64-bit programs
            UNSUPPORTED_RETURN_TYPE(returnType);
            return;
        } else if (EQUAL(returnType, "q")) { // long long
            long long retval = objc_call(long long, obj->obj_, sel);
            args.GetReturnValue().Set((double)retval);
            return;
        } else if (EQUAL(returnType, "C")) { // unsigned char
            UNSUPPORTED_RETURN_TYPE(returnType);
            return;
        } else if (EQUAL(returnType, "I")) { // unsigned int
            unsigned int retval = objc_call(unsigned int, obj->obj_, sel);
            args.GetReturnValue().Set((double)retval);
            return;
        } else if (EQUAL(returnType, "S")) { // unsigned short
            unsigned short retval = objc_call(unsigned short, obj->obj_, sel);
            args.GetReturnValue().Set(retval);
            return;
        } else if (EQUAL(returnType, "Q")) { // unsigned long long
            unsigned long long retval = objc_call(unsigned long long, obj->obj_, sel);
            args.GetReturnValue().Set((double) retval);
            return;
        } else if (EQUAL(returnType, "f")) { // float
            float retval = objc_call(float, obj->obj_, sel);
            args.GetReturnValue().Set(retval);
            return;
        } else if (EQUAL(returnType, "d")) { // double
            double retval = objc_call(double, obj->obj_, sel);
            args.GetReturnValue().Set(retval);
            return;
        } else if (EQUAL(returnType, "B")) { // bool
            bool retval = objc_call(bool, obj->obj_, sel);
            args.GetReturnValue().Set(retval);
            return;
        } else if (EQUAL(returnType, "v")) { // void
            // Custom cast because the macro would attempt to initialize a variable to type void, which would fail
            void (*msgSend_void)(id, SEL, ...) = (void (*) (id, SEL, ...)) objc_msgSend;
            msgSend_void(obj->obj_, sel_getUid(sel));
            args.GetReturnValue().Set(Undefined(isolate));
            return;
        } else if (EQUAL(returnType, "*")) { // char *
            char* retval = objc_call(char*, obj->obj_, sel);
            args.GetReturnValue().Set(String::NewFromUtf8(isolate, retval));
            return;
        } else if (EQUAL(returnType, "#")) { // Class
            UNSUPPORTED_RETURN_TYPE(returnType);
            // TODO return class wrapper
            return;
        } else if (EQUAL(returnType, ":")) { // SEL
            UNSUPPORTED_RETURN_TYPE(returnType);
            // TOOD ¯\_(ツ)_/¯
            return;
        } else {
            char *excMessage;
            asprintf(&excMessage, "Unknown return type '%s' on +[%s %s]", returnType, class_getName(object_getClass(obj->obj_)), sel);
            isolate->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8(isolate, excMessage)));
            free(excMessage);
            return;
        }
    }

    void Proxy::ReturnTypeOfMethod(const FunctionCallbackInfo<Value> &args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        SEL sel = sel_getUid(ValueToChar(isolate, args[0]));


        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());

        Method method;

        switch (obj->type_) {
            case Type::klass: method = class_getClassMethod((Class)obj->obj_, sel); break;
            case Type::instance: method = class_getInstanceMethod(object_getClass(obj->obj_), sel); break;
        }

        const char *returnType = method_copyReturnType(method);

        args.GetReturnValue().Set(String::NewFromUtf8(isolate, returnType));


    }
}
