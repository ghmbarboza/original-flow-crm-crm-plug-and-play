import { Skeleton } from "@/components/ui/skeleton";

/** Fallback de Suspense para as páginas carregadas via lazy(). */
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="space-y-3 pt-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
