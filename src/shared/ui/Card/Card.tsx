import { ReactNode } from 'react';
import styles from './Card.module.css';

interface Props {
  title: string;
  meta?: string;
  children?: ReactNode;
}

export const Card = ({ title, meta, children }: Props) => (
  <article className={styles.card}>
    <h4 className={styles.title}>{title}</h4>
    {meta && <p className={styles.meta}>{meta}</p>}
    {children}
  </article>
);
