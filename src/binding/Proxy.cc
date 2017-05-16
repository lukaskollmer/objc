//
// Created by Lukas Kollmer on 17.04.17.
//

#include <node.h>
#include <string>
#include <iostream>
#include <set>
#include "Proxy.h"
#include "objc_call.h"

#include "Invocation.h"
#include "utils.h"



SEL resolveSelector(id target, const char *sel) {
    std::string selector(sel);

    std::replace(selector.begin(), selector.end(), '_', ':'); // TODO make this smart and support methods that include an unserscore
    return sel_getUid(selector.c_str());
}

template< typename T >
inline bool is_aligned( T*p, size_t n = alignof(T) ){
    return 0 == reinterpret_cast<uintptr_t>(p) % n ;
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

#define ARGTYPE_NOT_SUPPORTED(type) \
    char *excMessage; \
    asprintf(&excMessage, "Error setting argument: Type '%s' not yet supported. Sorry.", type); \
    isolate->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8(isolate, excMessage))); \
    free(excMessage); \
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
        NODE_SET_PROTOTYPE_METHOD(tpl, "isNil", IsNil);
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

    void Proxy::IsNil(const FunctionCallbackInfo<Value> &args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());
        auto isNil = obj->obj_ == nil;

        args.GetReturnValue().Set(isNil);
    }

    void Proxy::Call(const FunctionCallbackInfo<Value>& args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        Local<ObjectTemplate> TemplateObject = ObjectTemplate::New();
        TemplateObject->SetInternalFieldCount(1);

        Local<String> __ptr_key = String::NewFromUtf8(isolate, "__ptr");
        Local<String> __ref_key = String::NewFromUtf8(isolate, "ref");

        auto isKindOfClass = [](id object, const char *classname) -> bool {
            return objc_call(bool, object, "isKindOfClass:", objc_getClass(classname));
        };

        auto align_upwards = [](id obj, uintptr_t align) -> id {
            assert(align > 0 && (align & (align - 1)) == 0); /* Power of 2 */

            uintptr_t addr  = (uintptr_t)obj;
            if (addr % align != 0)
                addr += align - addr % align;
            assert(addr >= (uintptr_t)obj);
            return (id)addr;
        };


        // Wrap an `id` in a `ObjC::Proxy` in a `Local<Object>` that can be returned by v8
        auto CreateNewObjCWrapperFrom = [&](id obj) -> Local<Object> {
            if (!is_aligned(obj)) {
                printf("NOT ALIGNED\n");

                //printf("is string: %i\n", isKindOfClass(obj, "NSString"));


                isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "Internal Error: Unable to align pointer")));
                return Undefined(isolate)->ToObject();
            }

            Local<Object> object = TemplateObject->NewInstance();
            object->SetAlignedPointerInInternalField(0, obj);
            // TODO ^^ This sometimes crashes w/ a "pointer not aligned" error message (seems to happen at random, should try to fix eventually)

            const unsigned argc = 2;
            Local<Value> argv[argc] = {Number::New(isolate, 1), object};
            Local<Function> cons = Local<Function>::New(isolate, constructor);
            Local<Context> context = isolate->GetCurrentContext();
            Local<Object> instance = cons->NewInstance(context, argc, argv).ToLocalChecked();

            return instance;
        };

        Proxy *obj = ObjectWrap::Unwrap<Proxy>(args.This());

        SEL sel = resolveSelector(obj->obj_, ValueToChar(isolate, args[0]));

        Method method;

        switch (obj->type_) {
            case Type::klass: method = class_getClassMethod((Class)obj->obj_, sel); break;
            case Type::instance: method = class_getInstanceMethod(object_getClass(obj->obj_), sel); break;
        }

        //printf("%s - %s\n", sel_getName(sel), method_getTypeEncoding(method));


        auto invocation = ObjC::Invocation(obj->obj_, sel);
        invocation.SetTarget(obj->obj_);
        invocation.SetSelector(sel);

        // The argument indexes of all inout arguments (^@)
        std::set<int> inoutArgs;

        // Why not use auto? -> http://stackoverflow.com/a/14532044/2513803
        std::function<id (Local<Value>, const char*)> convertJavaScriptObjectToCorrespondingObjCType = [&](Local<Value> arg, const char* expectedType) -> id {

            if (arg->IsObject() && !arg->IsArray()) { // Arrays are objects too
                Local<Object> wrappedObject;

                if (EQUAL(expectedType, "@")) {
                    // args[i] is the JS Proxy type, we have to fetch the actual ObjC::Proxy wrapper via __ptr
                    wrappedObject = arg->ToObject()->Get(__ptr_key)->ToObject();
                } else if (EQUAL(expectedType, "^@")) {
                    auto wrappedProxy = arg->ToObject()->Get(__ref_key);
                    auto proxyIsNull = wrappedProxy->IsUndefined() || wrappedProxy->IsNull();

                    if (proxyIsNull) {
                        id _nullptr = (id)malloc(sizeof(id));
                        return _nullptr;
                    } else {
                        wrappedObject = arg->ToObject()->Get(__ref_key)->ToObject()->Get(__ptr_key)->ToObject();
                    }
                }

                Proxy *passedProxy = ObjectWrap::Unwrap<Proxy>(wrappedObject);
                if (passedProxy != nullptr) {
                    id argument = passedProxy->obj_;
                    return argument;
                } else {
                    // TODO set nil as arg
                }
                // 2. if no wrapped object was passed, but a native type (string, number, bool), convert that
            } else if (arg->IsString()) {
                const char* stringValue = ValueToChar(isolate, arg);

                id NSString = (id)objc_getClass("NSString");
                id string = objc_call(id, NSString, "stringWithUTF8String:", stringValue);

                return string;
            } else if (arg->IsNumber()) {
                double numberValue = arg->ToNumber()->Value();

                id NSNumber = (id)objc_getClass("NSNumber");
                id number = objc_call(id, NSNumber, "numberWithDouble:", numberValue);

                return number;
            } else if (arg->IsBoolean()) {
                bool boolValue = arg->ToBoolean()->Value();

                id NSNumber = (id)objc_getClass("NSNumber");
                id number = objc_call(id, NSNumber, "numberWithBool:", boolValue);

                return number;
            } else if (arg->IsArray()) {  // TODO Convert array/dict as well?
                Local<Array> argArray = Local<Array>::Cast(arg);

                id NSMutableArray = (id)objc_getClass("NSMutableArray");
                id objcArray = objc_call(id, NSMutableArray, "array");

                for (int j = 0; j < argArray->Length(); ++j) {
                    id arrayObject = convertJavaScriptObjectToCorrespondingObjCType(argArray->Get((uint32_t) j), "@");
                    objc_call_noreturn(void, objcArray, "addObject:", arrayObject);
                }

                return objcArray;
            }

            return nil;

        };


        for (int i = 1; i < args.Length(); ++i) {
            int objcArgumentIndex = i + 1; // +1 bc we already start at 1 (0 is the method name, added by the objc js module)

            auto expectedType = method_copyArgumentType(method, (unsigned int) objcArgumentIndex);
            Local<Value> arg = args[i];

            if (arg->IsNull() || arg->IsUndefined()) {
                void* nilArgument = nullptr;
                invocation.SetArgumentAtIndex(&nilArgument, objcArgumentIndex);
                continue;
            }

            if (EQUAL(expectedType, "^@")) { // inout object
                inoutArgs.insert(objcArgumentIndex);
            }

            if (EQUAL(expectedType, "@") || EQUAL(expectedType, "^@")) {
                id object = convertJavaScriptObjectToCorrespondingObjCType(arg, expectedType);
                invocation.SetArgumentAtIndex(&object, objcArgumentIndex);

            } else if (EQUAL(expectedType, "#")) { // Class
                // This will either take a proxy around a `Class` object or a string and convert that to the expected `Class` object
                if (arg->IsString()) {
                    const char *classname = ValueToChar(isolate, arg);
                    Class cls = objc_getClass(classname);
                    invocation.SetArgumentAtIndex(&cls, objcArgumentIndex);
                } else if (arg->IsObject()) {
                    Local<Object> wrappedObject = arg->ToObject()->Get(String::NewFromUtf8(isolate, "__ptr"))->ToObject();

                    Proxy *passedClassProxy = ObjectWrap::Unwrap<Proxy>(wrappedObject);
                    if (passedClassProxy != nullptr) {
                        if (passedClassProxy->type_ == Type::klass) {
                            Class cls = (Class)passedClassProxy->obj_;
                            invocation.SetArgumentAtIndex(&cls, objcArgumentIndex);
                        } else {
                            // TODO ???
                        }
                    } else {
                        // TODO pass nil?
                    }
                }
            } else if (EQUAL(expectedType, "c")) { // char
                ARGTYPE_NOT_SUPPORTED("char");
            } else if (EQUAL(expectedType, "i")) { // int
                int argument = arg->ToNumber()->ToInt32()->Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "s")) { // short
                ARGTYPE_NOT_SUPPORTED("short");
            } else if (EQUAL(expectedType, "q")) { // long long
                long long argument = (long long) arg->ToNumber()->Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "C")) { // unsigned char
                ARGTYPE_NOT_SUPPORTED("unsigned char");
            } else if (EQUAL(expectedType, "I")) { // unsigned int
                unsigned int argument = (unsigned int) arg->ToNumber()->Int32Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "S")) { // unsigned short
                ARGTYPE_NOT_SUPPORTED("unsigned short");
            } else if (EQUAL(expectedType, "L")) { // unsigned long
                unsigned long argument = (unsigned long) arg->ToNumber()->Int32Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "Q")) { // unsigned long long
                unsigned long long argument = (unsigned long long) arg->ToNumber()->Int32Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "f")) { // float
                float argument = (float) arg->ToNumber()->Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "d")) { // double
                double argument = arg->ToNumber()->Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "B")) { // bool
                bool argument = arg->ToBoolean()->Value();
                invocation.SetArgumentAtIndex(&argument, objcArgumentIndex);
            } else if (EQUAL(expectedType, "v")) { // void
                ARGTYPE_NOT_SUPPORTED("void");
            } else if (EQUAL(expectedType, "*") || EQUAL(expectedType, "r*")) { // char*, const char*
                ARGTYPE_NOT_SUPPORTED("char*");
            } else if (EQUAL(expectedType, ":")) { // SEL
                // selectors can be passed as strings.
                SEL _sel = sel_getUid(ValueToChar(isolate, arg));
                invocation.SetArgumentAtIndex(&_sel, objcArgumentIndex);
            } else if (EQUAL(expectedType, "^v") || EQUAL(expectedType, "r^v")) { // void*, const void*
                ARGTYPE_NOT_SUPPORTED("void*");
            }
        }


        //
        // Invoke
        //

        invocation.Invoke();



        //
        // Handle inout args
        //

        for (auto &&objcArgumentIndex : inoutArgs) {
            int javaScriptArgumentIndex = objcArgumentIndex - 1; // 0 is the method name

            id *arg = (id *)malloc(sizeof(id));
            invocation.GetArgumentAtIndex(&arg, objcArgumentIndex);
            id unwrappedArg = *arg;

            if (unwrappedArg != nil) {
                auto wrappedValue = CreateNewObjCWrapperFrom(unwrappedArg);
                args[javaScriptArgumentIndex]->ToObject()->Set(__ref_key, wrappedValue);
            } else {
                // TODO test this
                args[javaScriptArgumentIndex]->ToObject()->Set(__ref_key, Undefined(isolate)); // TODO set Null instead
            }
        }


        //
        // Handle return value
        //

        const char *returnType = method_copyReturnType(method);
        //printf("%s - %s\n", returnType, sel_getName(sel));

        if (EQUAL(returnType, "@")) {
            id retval = (id)malloc(sizeof(id));
            invocation.GetReturnValue(&retval);

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
            printf("will wrap return object for method: %s %s\n", sel_getName(sel), description(retval));
            args.GetReturnValue().Set(CreateNewObjCWrapperFrom(retval));
            return;
        } else if (EQUAL(returnType, "c")) { // char
            // Fun Fact: ObjC BOOLs are encoded as char https://developer.apple.com/reference/objectivec/bool?language=objc
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
            HANDLE_RETURN_TYPE_CAST(unsigned long, int32_t);
        } else if (EQUAL(returnType, "Q")) { // unsigned long long
            HANDLE_RETURN_TYPE_CAST(unsigned long long, int32_t);
        } else if (EQUAL(returnType, "f")) { // float
            HANDLE_RETURN_TYPE(float);
        } else if (EQUAL(returnType, "d")) { // double
            HANDLE_RETURN_TYPE(double);
        } else if (EQUAL(returnType, "B")) { // bool
            HANDLE_RETURN_TYPE(BOOL);
        } else if (EQUAL(returnType, "v")) { // void
            args.GetReturnValue().Set(Undefined(isolate));
        } else if (EQUAL(returnType, "*") || EQUAL(returnType, "r*")) { // char*, const char*
            char* retval;
            invocation.GetReturnValue(&retval);
            Local<Value> string = String::NewFromUtf8(isolate, retval);
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
