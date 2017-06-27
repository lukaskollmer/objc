//
// Created by Lukas Kollmer on 24.06.17.
//

#include "Block.h"
#include <node.h>
#include "objc_call.h"
#include "utils.h"
#include "Invocation.h"
#include "Proxy.h"

using namespace std;

namespace ObjC {

    // Forward declaration
    void* block_invoke(struct __block_literal* block, ...);


    Persistent<Function> Block::constructor;

    void Block::Init(Local<Object> exports) {
        Isolate *isolate = exports->GetIsolate();
        HandleScope scope(isolate);

        Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, New);
        tpl->SetClassName(v8String("Block"));
        tpl->InstanceTemplate()->SetInternalFieldCount(1);

        // TODO Maybe export constants to the type encodings?

        constructor.Reset(isolate, tpl->GetFunction());
        exports->Set(v8String("Block"), tpl->GetFunction());
    }


    void Block::New(const FunctionCallbackInfo<Value>& args) {
        Isolate *isolate = args.GetIsolate();
        HandleScope scope(isolate);

        if (!args[0]->IsFunction()) {
            v8Throw("You need to pass a function to `objc.Block`");
            return;
        }


        if (!args[1]->IsArray()) {
            v8Throw("You need to pass an array of type encodings to `objc.Block`");
            return;
        }

        if (!args[1]->ToObject()->Get(1)->IsArray()) {
            v8Throw("Wrong block encoding format. Check the docs");
        }

        //
        // Fetch the block's type encodings
        //

        // Return Type
        auto returnTypeEncoding = ValueToChar(isolate, args[1]->ToObject()->Get(0));

        // Arguments
        vector<const char*> argumentTypeEncodings;

        auto argTypes = Local<Array>::Cast(args[1]->ToObject()->Get(1));
        for (int i = 0; i < argTypes->Length(); ++i) {
            auto argumentEncoding = ValueToChar(isolate, argTypes->Get(i));
            argumentTypeEncodings.push_back(argumentEncoding);
        }


        Block *block = new Block();
        block->returnTypeEncoding = returnTypeEncoding;
        block->argumentTypeEncodings = argumentTypeEncodings;
        block->function = Persistent<Function, CopyablePersistentTraits<Function>>(isolate, Local<Function>::Cast(args[0]));
        block->Wrap(args.This());

        args.GetReturnValue().Set(args.This());
    }

    struct __block_literal* Block::ToBlockLiteral() {

        auto block_literal = new __block_literal;
        block_literal->isa      = _NSConcreteGlobalBlock;
        block_literal->flags    = (1<<28);
        block_literal->invoke = (void*) block_invoke;
        block_literal->isolate = Isolate::GetCurrent();
        block_literal->function = function;
        block_literal->returnType = this->returnTypeEncoding;
        block_literal->argumentTypes = this->argumentTypeEncodings;

        return block_literal;
    }

    void* block_invoke(struct __block_literal* block, ...) {
        Isolate *isolate = block->isolate;

        //
        // Handle Arguments
        //

        auto argc = (int) block->argumentTypes.size();

        Local<Value> *argv = new Local<Value>[argc];

        va_list ap;
        va_start(ap, block);
        for (int i = 0; i < argc; ++i) {
#define ARGTYPE(type) EQUAL(block->argumentTypes[i], type)

#define HANDLE_ARGTYPE(type) \
    type arg = va_arg(ap, type); \
    argv[i] = Local<Value>::New(isolate, v8::Number::New(isolate, arg));

#define HANDLE_ARGTYPE_CAST(type, castedType) \
    type arg = va_arg(ap, type); \
    argv[i] = Local<Value>::New(isolate, v8::Number::New(isolate, (castedType)arg));

            if (ARGTYPE("@")) {
                id arg = va_arg(ap, id);
                if (arg != nullptr) {
                    argv[i] = Local<Value>::New(isolate, Proxy::CreateNewObjCWrapperFrom(isolate, arg));
                } else {
                    argv[i] = Local<Value>::New(isolate, Null(isolate));
                }
            } else if (ARGTYPE("c")) { // char
                HANDLE_ARGTYPE_CAST(char, int32_t)
            } else if (ARGTYPE("i")) { // int
                HANDLE_ARGTYPE(int)
            } else if (ARGTYPE("s")) { // short
                HANDLE_ARGTYPE(short)
            } else if (ARGTYPE("q")) { // long long
                HANDLE_ARGTYPE(long long)
            } else if (ARGTYPE("C")) { // unsigned char
                HANDLE_ARGTYPE(unsigned char)
            } else if (ARGTYPE("I")) { // unsigned int
                HANDLE_ARGTYPE(unsigned int)
            } else if (ARGTYPE("S")) { // unsigned short
                HANDLE_ARGTYPE(unsigned short)
            } else if (ARGTYPE("L")) { // unsigned long
                HANDLE_ARGTYPE(unsigned long)
            } else if (ARGTYPE("Q")) { // unsigned long long
                HANDLE_ARGTYPE(unsigned long long)
            } else if (ARGTYPE("f")) { // float
                HANDLE_ARGTYPE(float)
            } else if (ARGTYPE("d")) { // double
                HANDLE_ARGTYPE(double)
            } else if (ARGTYPE("B")) { // bool
                HANDLE_ARGTYPE(BOOL)
            } else if (ARGTYPE("*") || ARGTYPE("r*")) { // char*, const char*
                char *arg = va_arg(ap, char*);
                argv[i] = v8String(arg);
            } else if (ARGTYPE("#")) { // Class
                // For now, Classes are passed as strings. TODO: Pass as Proxy
                Class arg = va_arg(ap, Class);
                argv[i] = v8String(class_getName(arg));
            } else if (ARGTYPE(":")) { // SEL
                SEL arg = va_arg(ap, SEL);
                argv[i] = v8String(sel_getName(arg));
            }
#undef ARGTYPE
#undef HANDLE_ARGTYPE
        }
        va_end(ap);

        //
        // Call the function
        //

        auto function = Local<Function>::New(isolate, block->function);

        // TODO: Maybe map `this` in the block (presumably the first argument) to the block itself???
        Local<Value> retVal = function->Call(isolate->GetCallingContext()->Global(), argc, argv);

        delete [] argv;


        //
        // Handle the return value
        //

#define BLOCK_RETURNS(type) EQUAL(block->returnType, type)
#define GUARD_RETVAL_TYPE(condition) \
    if (!condition) { \
        std::string returnTypeErrorMessage("The block should return "); \
        returnTypeErrorMessage.append(block->returnType); \
        isolate->ThrowException(Exception::Error(v8String(returnTypeErrorMessage.c_str()))); \
        return nullptr; \
    }
#define HANDLE_BLOCK_RETURN(type) return (void *) (type) retVal->ToNumber()->IntegerValue();
        if (BLOCK_RETURNS("@")) {
            Proxy *proxy = ObjectWrap::Unwrap<Proxy>(retVal->ToObject());
            return proxy->GetWrappedObject();
        } else if (BLOCK_RETURNS("#")) { // Class
            // If the block is supposed to return a Class, the JS function should return the classname as a string, we'll take care of it.
            // TODO this should support class wrappers eventually
            auto classname = ValueToChar(isolate, retVal);
            return objc_getClass(classname);
        } else if (BLOCK_RETURNS("c")) { // char
            HANDLE_BLOCK_RETURN(char);
        } else if (BLOCK_RETURNS("i")) { // int
            HANDLE_BLOCK_RETURN(int);
        } else if (BLOCK_RETURNS("s")) { // short
            HANDLE_BLOCK_RETURN(short);
        } else if (BLOCK_RETURNS("q")) { // long long
            HANDLE_BLOCK_RETURN(long long);
        } else if (BLOCK_RETURNS("C")) { // unsigned char
            HANDLE_BLOCK_RETURN(unsigned char);
        } else if (BLOCK_RETURNS("I")) { // unsigned int
            HANDLE_BLOCK_RETURN(unsigned int);
        } else if (BLOCK_RETURNS("S")) { // unsigned short
            HANDLE_BLOCK_RETURN(unsigned short);
        } else if (BLOCK_RETURNS("L")) { // unsigned long
            HANDLE_BLOCK_RETURN(unsigned long);
        } else if (BLOCK_RETURNS("Q")) { // unsigned long long
            HANDLE_BLOCK_RETURN(unsigned long long);
        } else if (BLOCK_RETURNS("f")) { // float
            float val = (float) retVal->ToNumber()->Value();
            return &val;
        } else if (BLOCK_RETURNS("d")) { // double
            double val = retVal->ToNumber()->Value();
            return &val;
        } else if (BLOCK_RETURNS("B")) { // bool
            HANDLE_BLOCK_RETURN(BOOL);
        } else if (BLOCK_RETURNS("v")) { // void
            HANDLE_BLOCK_RETURN(char);
        } else if (BLOCK_RETURNS("*")) { // char*
            return (void*) ValueToChar(isolate, retVal->ToString());
        } else if (BLOCK_RETURNS("r*")) { // const char*
            return (void*) ValueToChar(isolate, retVal->ToString());
        } else if (BLOCK_RETURNS(":")) { // SEL
            return sel_getUid(ValueToChar(isolate, retVal));
        } else if (BLOCK_RETURNS("^v")) { // void*
            // TODO: Implement
            return nullptr;
        }
#undef BLOCK_RETURNS

        return nullptr;
    }
}