export default function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="product-card-skeleton">
          <div className="skeleton product-card-skeleton__media" />
          <div className="skeleton product-card-skeleton__line product-card-skeleton__line--title" />
          <div className="skeleton product-card-skeleton__line product-card-skeleton__line--price" />
        </div>
      ))}
    </div>
  )
}
