"use client";

import Link from "next/link";
import Image from "next/image";
import logo from "./hlogo.png";
import { usePathname } from "next/navigation";
import styles from "../styles/navbar.module.css";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { name: "Home", href: "/" },
    { name: "Practice", href: "/practice" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "About", href: "/about" },
  ];

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        {/* Logo + Name */}
        <Link href="/" className={styles.logoContainer}>
          <div className={styles.logoWrapper}>
            <Image
              src={logo}
              alt="InterView AI Logo"
              fill
              className={styles.logo}
            />
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className={styles.navLinks}>
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={`${styles.navLink} ${
                pathname === link.href ? styles.active : ""
              }`}
            >
              {link.name}
              <span
                className={`${styles.underline} ${
                  pathname === link.href ? styles.underlineActive : ""
                }`}
              />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
