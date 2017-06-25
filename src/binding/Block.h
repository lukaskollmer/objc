//
// Created by Lukas Kollmer on 24.06.17.
//

#ifndef OBJC_BLOCK_H
#define OBJC_BLOCK_H

#include <v8.h>
#include <node_object_wrap.h>
#include <Block.h>

using namespace v8;
using node::ObjectWrap;

namespace ObjC {
    using PersistentBlockFunction = Persistent<Function, CopyablePersistentTraits<Function>>;

    // llvm blocks ABI: https://clang.llvm.org/docs/Block-ABI-Apple.html#c-support
    struct __block_literal {
        void *isa;
        int flags;
        int reserved;
        //int (*invoke)(struct __block_literal_1 *, ...);
        void *invoke;
        struct __block_descriptor_1 *descriptor;
        // Custom Fields
        PersistentBlockFunction function; // Custom field to make the wrapped JS function available. (TODO: Should this be put in the descriptor?)
        const char* returnType;
        std::vector<const char*> argumentTypes;

    };

    //static struct __block_descriptor {
    //    unsigned long int reserved;
    //    unsigned long int Block_size;
    //} __block_descriptor_1 = { 0, sizeof(struct __block_literal_1)/*, __block_invoke_1 */};


    class Block : public ObjectWrap {
    public:
        static void Init(Local<Object> exports);
        static void New(const FunctionCallbackInfo<Value>& args);

        struct __block_literal* ToBlockLiteral();

    private:
        static Persistent<Function> constructor;
        Persistent<Function, CopyablePersistentTraits<Function>> function;
        const char* returnTypeEncoding;
        std::vector<const char*>argumentTypeEncodings;
    };
}


#endif //OBJC_BLOCK_H
