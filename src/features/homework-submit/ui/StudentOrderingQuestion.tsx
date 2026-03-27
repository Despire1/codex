import { CSSProperties, FC, HTMLAttributes, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { HomeworkTestOption } from '../../../entities/types';
import styles from './StudentOrderingQuestion.module.css';

interface StudentOrderingQuestionProps {
  items: HomeworkTestOption[];
  selectedOrder: string[];
  canEdit: boolean;
  onChange: (nextOrder: string[]) => void;
}

interface OrderingCardProps {
  item: HomeworkTestOption;
  index: number;
  canEdit: boolean;
  overlay?: boolean;
  dragging?: boolean;
  itemRef?: (node: HTMLDivElement | null) => void;
  handleRef?: (node: HTMLButtonElement | null) => void;
  style?: CSSProperties;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}

const OrderingCard: FC<OrderingCardProps> = ({
  item,
  index,
  canEdit,
  overlay = false,
  dragging = false,
  itemRef,
  handleRef,
  style,
  handleProps,
}) => (
  <div
    ref={itemRef}
    style={style}
    className={`${styles.orderingItem} ${dragging ? styles.orderingItemDragging : ''} ${overlay ? styles.orderingItemOverlay : ''}`}
  >
    <span className={styles.orderingIndex}>{index + 1}</span>
    <button
      type="button"
      ref={handleRef}
      className={styles.orderingDragHandle}
      disabled={!canEdit}
      aria-label={`Перетащить шаг ${index + 1}`}
      {...handleProps}
    >
      <FontAwesomeIcon icon={faBars} />
    </button>
    <span className={styles.orderingText}>{item.text}</span>
  </div>
);

interface SortableOrderingCardProps {
  item: HomeworkTestOption;
  index: number;
  canEdit: boolean;
}

const SortableOrderingCard: FC<SortableOrderingCardProps> = ({ item, index, canEdit }) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <OrderingCard
      item={item}
      index={index}
      canEdit={canEdit}
      dragging={isDragging}
      itemRef={setNodeRef}
      handleRef={setActivatorNodeRef}
      style={style}
      handleProps={canEdit ? { ...attributes, ...listeners } : undefined}
    />
  );
};

export const StudentOrderingQuestion: FC<StudentOrderingQuestionProps> = ({
  items,
  selectedOrder,
  canEdit,
  onChange,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);
  const orderedItems = useMemo(
    () => selectedOrder.map((itemId) => itemById.get(itemId)).filter((item): item is HomeworkTestOption => Boolean(item)),
    [itemById, selectedOrder],
  );
  const activeIndex = activeId ? selectedOrder.indexOf(activeId) : -1;
  const activeItem = activeId ? itemById.get(activeId) ?? null : null;

  useEffect(() => {
    if (!activeId) return;
    document.body.classList.add(styles.overlayCursor);
    return () => {
      document.body.classList.remove(styles.overlayCursor);
    };
  }, [activeId]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeItemId = String(active.id);
    const overItemId = String(over.id);
    if (activeItemId !== overItemId) {
      const oldIndex = selectedOrder.indexOf(activeItemId);
      const newIndex = selectedOrder.indexOf(overItemId);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(selectedOrder, oldIndex, newIndex));
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={selectedOrder} strategy={verticalListSortingStrategy}>
          <div className={styles.orderingList}>
            {orderedItems.map((item, index) => (
              <SortableOrderingCard key={item.id} item={item} index={index} canEdit={canEdit} />
            ))}
          </div>
        </SortableContext>
        {typeof document !== 'undefined'
          ? createPortal(
              <DragOverlay adjustScale={false}>
                {activeItem ? (
                  <OrderingCard
                    item={activeItem}
                    index={activeIndex === -1 ? 0 : activeIndex}
                    canEdit={canEdit}
                    overlay
                  />
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
    </>
  );
};
