import { FacebookIcon, InstagramIcon, LocationIcon, WhatsappIcon } from '../icons'

export default function Footer() {
  const address = import.meta.env.VITE_STORE_ADDRESS || 'Casuarina 120 B, Circunvalación Nte., 20020 Aguascalientes, Ags.'
  const whatsapp = import.meta.env.VITE_WHATSAPP_NUMBER
  const instagram = import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com/andary_shop_ags/'
  const facebook = import.meta.env.VITE_FACEBOOK_URL || 'https://www.facebook.com/profile.php?id=61562862076269'

  return (
    <footer className="site-footer">
      <div className="site-footer__grid">
        <div className="site-footer__brand">
          <span className="site-footer__logo">ANDARY SHOP</span>
          <p>Tienda de ropa con artículos de la mejor calidad.</p>
        </div>

        <div className="site-footer__col">
          <h3>Contacto</h3>
          <p className="site-footer__row">
            <LocationIcon />
            {address}
          </p>
          {whatsapp && (
            <a
              className="site-footer__row"
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsappIcon />
              Escríbenos por WhatsApp
            </a>
          )}
        </div>

        <div className="site-footer__col">
          <h3>Síguenos</h3>
          <div className="site-footer__socials">
            <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a href={facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <FacebookIcon />
            </a>
          </div>
        </div>
      </div>

      <p className="site-footer__copy">© {new Date().getFullYear()} ANDARY SHOP. Todos los derechos reservados.</p>
    </footer>
  )
}
