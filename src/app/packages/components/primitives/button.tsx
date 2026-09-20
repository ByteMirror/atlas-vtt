import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../../../../utils/cn";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "toolbar";

type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const composedClassName = cn(
      "btn",
      `btn--${variant}`,
      size !== "default" && `btn--${size}`,
      className
    );

    return <Comp className={composedClassName} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";

export { Button };
