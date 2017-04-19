//
// Created by Lukas Kollmer on 18.04.17.
//

#ifndef OBJC_INVOCATION_H
#define OBJC_INVOCATION_H

#include <string>

extern "C" {
#include <objc/runtime.h>
};

namespace ObjC {
    const char *description(id object, bool debug = true);

    class Invocation {
    public:
        Invocation(id target, SEL selector);
        ~Invocation();

        void SetSelector(SEL selector) { this->selector_ = selector; }
        SEL GetSelector() { return this->selector_; }

        void SetTarget(id target) { this->target_ = target; }
        id GetTarget() { return this->target_; }

        void SetArgumentAtIndex(void* arg, int index);
        void GetArgumentAtIndex(void* arg, int index);

        bool ArgumentAreRetained();

        void RetainArguments();

        void SetReturnValue(void* retval);
        void GetReturnValue(void* retval);

        void Invoke();
        void InvokeWithTarget(id target);

        id GetMethodSignature();



    private:
        id target_;
        SEL selector_;

        id invocation_;
    };
}


#endif //OBJC_INVOCATION_H
