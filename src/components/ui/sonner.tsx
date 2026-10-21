import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Top right: bottom right is where the focus-timer pill lives, and a toast would sit on it.
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // A coloured edge says what kind of message it is; the icon and the words say it too.
          // No sound for any of them: a problem is shown clearly, never announced loudly.
          success: "group-[.toaster]:border-l-[3px] group-[.toaster]:border-l-success!",
          warning: "group-[.toaster]:border-l-[3px] group-[.toaster]:border-l-warning!",
          error: "group-[.toaster]:border-l-[3px] group-[.toaster]:border-l-destructive!",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
