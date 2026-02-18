import { FC } from 'react';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell as farBell } from '@fortawesome/free-regular-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import {
  faAlignLeft,
  faBolt,
  faCheck,
  faChevronDown,
  faCircleExclamation,
  faFilePdf,
  faFilter,
  faGear,
  faLayerGroup,
  faLink,
  faListCheck,
  faMicrophone,
  faRotateRight,
  faStar,
} from '@fortawesome/free-solid-svg-icons';

export type HomeworkIconSize = 10 | 12 | 13 | 14 | 16 | 18 | 20;

export interface HomeworkFaIconProps {
  size?: HomeworkIconSize;
  className?: string;
  title?: string;
}

const HomeworkFaIcon: FC<HomeworkFaIconProps & { icon: IconDefinition }> = ({
  icon,
  size = 14,
  className,
  title,
}) => (
  <FontAwesomeIcon
    icon={icon}
    className={className}
    title={title}
    style={{ fontSize: `${size}px`, lineHeight: 1 }}
    fixedWidth
    aria-hidden={!title}
  />
);

export const HomeworkLayerGroupIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faLayerGroup} {...props} />
);

export const HomeworkFilterIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFilter} {...props} />
);

export const HomeworkBoltIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBolt} {...props} />
);

export const HomeworkBellRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farBell} {...props} />
);

export const HomeworkCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCheck} {...props} />
);

export const HomeworkLinkIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faLink} {...props} />
);

export const HomeworkAlignLeftIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faAlignLeft} {...props} />
);

export const HomeworkFilePdfIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFilePdf} {...props} />
);

export const HomeworkCircleExclamationIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCircleExclamation} {...props} />
);

export const HomeworkRotateRightIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faRotateRight} {...props} />
);

export const HomeworkMicrophoneIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faMicrophone} {...props} />
);

export const HomeworkListCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faListCheck} {...props} />
);

export const HomeworkGearIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faGear} {...props} />
);

export const HomeworkChevronDownIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faChevronDown} {...props} />
);

export const HomeworkStarIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faStar} {...props} />
);

export const HomeworkStarRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farStar} {...props} />
);
