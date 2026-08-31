import { useEffect, useState } from "react";
import { useLocation, useNavigationType, useNavigate } from "react-router-dom";

export function useAppHistory() {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();

  const [{ stack, index }, setState] = useState({
    stack: [location.key],
    index: 0,
  });

  useEffect(() => {
    setState((prev) => {
      // If we are pushing a new route
      if (navType === "PUSH") {
        if (prev.stack[prev.index] === location.key) return prev;
        const newStack = prev.stack.slice(0, prev.index + 1);
        newStack.push(location.key);
        return { stack: newStack, index: newStack.length - 1 };
      } 
      // If we are replacing the current route
      else if (navType === "REPLACE") {
        if (prev.stack[prev.index] === location.key) return prev;
        const newStack = [...prev.stack];
        newStack[prev.index] = location.key;
        return { stack: newStack, index: prev.index };
      } 
      // If we are popping (going back or forward)
      else if (navType === "POP") {
        const foundIndex = prev.stack.indexOf(location.key);
        if (foundIndex !== -1) {
          return { stack: prev.stack, index: foundIndex };
        } else {
          // If the location key is completely unknown, reset the stack to just this entry.
          return { stack: [location.key], index: 0 };
        }
      }
      return prev;
    });
  }, [location.key, navType]);

  const canGoBack = index > 0;
  const canGoForward = index < stack.length - 1;

  const goBack = () => {
    if (canGoBack) navigate(-1);
  };

  const goForward = () => {
    if (canGoForward) navigate(1);
  };

  return { canGoBack, canGoForward, goBack, goForward };
}
