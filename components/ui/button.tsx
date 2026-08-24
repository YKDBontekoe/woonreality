import { Link } from "@/src/lib/i18n/navigation";
import type { Route } from "next";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "navCta";

const variantClass: Record<ButtonVariant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  ghost: "ghost-button",
  navCta: "nav-cta",
};

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: Route | string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  if ("href" in props && props.href) {
    const { variant = "primary", className = "", children, href } = props;
    const classes = ["ui-button", `ui-button--${variant === "navCta" ? "primary" : variant}`, variantClass[variant], className].filter(Boolean).join(" ");
    return (
      <Link className={classes} href={href as Route}>
        {children}
      </Link>
    );
  }

  const {
    variant = "primary",
    className = "",
    children,
    type = "button",
    ...rest
  } = props as ButtonAsButton;
  const classes = ["ui-button", `ui-button--${variant === "navCta" ? "primary" : variant}`, variantClass[variant], className].filter(Boolean).join(" ");

  return (
    <button className={classes} type={type} {...rest}>
      {children}
    </button>
  );
}
