import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none transition-[background-color,color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-hover",
  secondary:
    "bg-surface-raised text-ink border border-border-strong shadow-sm hover:border-ink hover:shadow-md",
  ghost: "bg-transparent text-ink hover:bg-accent-subtle hover:text-accent-ink",
  danger: "bg-danger text-canvas hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-base",
  lg: "h-13 px-7 text-lg",
};

/** Class string for a button look. Exported so links styled as buttons match exactly. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  return cx(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonElementProps = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonLinkProps = SharedProps &
  Omit<ComponentProps<typeof Link>, "className" | "children" | "href"> & {
    href: string;
  };

export type ButtonProps = ButtonElementProps | ButtonLinkProps;

/**
 * Renders a <button>, or a Next.js <Link> when `href` is given, so navigation
 * stays a real link for keyboard users, middle-click and prefetching.
 */
export function Button(props: ButtonProps) {
  const { variant, size, fullWidth, className, children, ...rest } = props;
  const classes = buttonClassName({ variant, size, fullWidth, className });

  if (props.href !== undefined) {
    const { href, ...linkRest } = rest as Omit<ButtonLinkProps, keyof SharedProps>;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {children}
      </Link>
    );
  }

  const { type = "button", ...buttonRest } = rest as Omit<ButtonElementProps, keyof SharedProps>;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
