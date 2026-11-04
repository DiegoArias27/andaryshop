/** Mirrors the profile-card shape (avatar + name/since + two link rows)
 * while customer auth is still resolving — the common case (a returning,
 * already-logged-in shopper) lands on this shape, not the guest form. */
export default function AccountSkeleton() {
  return (
    <div className="profile-card" aria-hidden="true">
      <div className="profile-header">
        <div className="skeleton account-skeleton__avatar" />
        <div className="account-skeleton__header-lines">
          <div className="skeleton account-skeleton__line account-skeleton__line--name" />
          <div className="skeleton account-skeleton__line account-skeleton__line--since" />
        </div>
      </div>
      <div className="skeleton account-skeleton__link" />
      <div className="skeleton account-skeleton__link" />
    </div>
  )
}
