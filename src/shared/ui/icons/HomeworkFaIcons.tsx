import { FC } from 'react';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell as farBell,
  faBookmark as farBookmark,
  faCalendarCheck as farCalendarCheck,
  faStar as farStar,
} from '@fortawesome/free-regular-svg-icons';
import {
  faArrowDown19,
  faArrowUp,
  faArrowUpRightFromSquare,
  faAlignLeft,
  faArrowsLeftRight,
  faBars,
  faBook,
  faBookOpen,
  faBell as faBellSolid,
  faBolt,
  faCalendarDay,
  faChartLine,
  faCheck,
  faCircleCheck,
  faChevronDown,
  faCircleExclamation,
  faCircleInfo,
  faClock,
  faCheckDouble,
  faCloudArrowUp,
  faCopy,
  faDownload,
  faEye,
  faFileArrowUp,
  faFileAudio,
  faFileImage,
  faFileLines,
  faFilePdf,
  faFileVideo,
  faFileWord,
  faFilter,
  faFolder,
  faGear,
  faGripVertical,
  faHourglassHalf,
  faInbox,
  faLayerGroup,
  faLink,
  faListCheck,
  faMagnifyingGlass,
  faMicrophone,
  faPaperclip,
  faPaperPlane,
  faPen,
  faPenToSquare,
  faPlay,
  faPlus,
  faPuzzlePiece,
  faRobot,
  faRotateRight,
  faSliders,
  faSpellCheck,
  faStar,
  faTableCells,
  faTrash,
  faTextWidth,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

export type HomeworkIconSize = 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 22;

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

export const HomeworkFolderIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFolder} {...props} />
);

export const HomeworkBookIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBook} {...props} />
);

export const HomeworkBookOpenIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBookOpen} {...props} />
);

export const HomeworkBarsIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBars} {...props} />
);

export const HomeworkFilterIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFilter} {...props} />
);

export const HomeworkMagnifyingGlassIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faMagnifyingGlass} {...props} />
);

export const HomeworkBoltIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBolt} {...props} />
);

export const HomeworkBellRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farBell} {...props} />
);

export const HomeworkBellIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faBellSolid} {...props} />
);

export const HomeworkBookmarkRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farBookmark} {...props} />
);

export const HomeworkCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCheck} {...props} />
);

export const HomeworkCircleCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCircleCheck} {...props} />
);

export const HomeworkLinkIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faLink} {...props} />
);

export const HomeworkAlignLeftIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faAlignLeft} {...props} />
);

export const HomeworkTextWidthIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faTextWidth} {...props} />
);

export const HomeworkFilePdfIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFilePdf} {...props} />
);

export const HomeworkFileWordIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileWord} {...props} />
);

export const HomeworkFileImageIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileImage} {...props} />
);

export const HomeworkFileAudioIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileAudio} {...props} />
);

export const HomeworkFileVideoIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileVideo} {...props} />
);

export const HomeworkCircleExclamationIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCircleExclamation} {...props} />
);

export const HomeworkCircleInfoIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCircleInfo} {...props} />
);

export const HomeworkClockIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faClock} {...props} />
);

export const HomeworkRotateRightIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faRotateRight} {...props} />
);

export const HomeworkMicrophoneIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faMicrophone} {...props} />
);

export const HomeworkSpellCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faSpellCheck} {...props} />
);

export const HomeworkListCheckIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faListCheck} {...props} />
);

export const HomeworkArrowsLeftRightIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faArrowsLeftRight} {...props} />
);

export const HomeworkArrowDown19Icon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faArrowDown19} {...props} />
);

export const HomeworkArrowUpIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faArrowUp} {...props} />
);

export const HomeworkTableCellsIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faTableCells} {...props} />
);

export const HomeworkGearIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faGear} {...props} />
);

export const HomeworkChevronDownIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faChevronDown} {...props} />
);

export const HomeworkPlusIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPlus} {...props} />
);

export const HomeworkXMarkIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faXmark} {...props} />
);

export const HomeworkFileArrowUpIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileArrowUp} {...props} />
);

export const HomeworkFileLinesIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faFileLines} {...props} />
);

export const HomeworkPenToSquareIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPenToSquare} {...props} />
);

export const HomeworkPenIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPen} {...props} />
);

export const HomeworkPuzzlePieceIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPuzzlePiece} {...props} />
);

export const HomeworkCopyIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCopy} {...props} />
);

export const HomeworkGripVerticalIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faGripVertical} {...props} />
);

export const HomeworkTrashIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faTrash} {...props} />
);

export const HomeworkEyeIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faEye} {...props} />
);

export const HomeworkDownloadIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faDownload} {...props} />
);

export const HomeworkArrowUpRightFromSquareIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faArrowUpRightFromSquare} {...props} />
);

export const HomeworkCloudArrowUpIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCloudArrowUp} {...props} />
);

export const HomeworkPaperclipIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPaperclip} {...props} />
);

export const HomeworkPaperPlaneIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPaperPlane} {...props} />
);

export const HomeworkInboxIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faInbox} {...props} />
);

export const HomeworkCalendarDayIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCalendarDay} {...props} />
);

export const HomeworkCalendarCheckRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farCalendarCheck} {...props} />
);

export const HomeworkHourglassHalfIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faHourglassHalf} {...props} />
);

export const HomeworkCheckDoubleIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faCheckDouble} {...props} />
);

export const HomeworkChartLineIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faChartLine} {...props} />
);

export const HomeworkPlayIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faPlay} {...props} />
);

export const HomeworkRobotIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faRobot} {...props} />
);

export const HomeworkSlidersIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faSliders} {...props} />
);

export const HomeworkStarIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={faStar} {...props} />
);

export const HomeworkStarRegularIcon: FC<HomeworkFaIconProps> = (props) => (
  <HomeworkFaIcon icon={farStar} {...props} />
);
