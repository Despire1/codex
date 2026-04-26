import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  assignmentBelongsToBucket,
  canTeacherEditHomeworkAssignment,
  resolveHomeworkAssignmentWorkflow,
} from './workflow';
import { normalizeHomeworkReviewResult } from '../../../homework-submission/model/lib/reviewResult';

const NOW = new Date('2026-04-12T12:00:00.000Z');

test('marks only owed work as overdue', () => {
  const overdue = resolveHomeworkAssignmentWorkflow(
    {
      status: 'SENT',
      sendMode: 'MANUAL',
      deadlineAt: '2026-04-11T12:00:00.000Z',
      latestSubmissionStatus: null,
    },
    NOW,
  );
  const lateSubmitted = resolveHomeworkAssignmentWorkflow(
    {
      status: 'SUBMITTED',
      sendMode: 'MANUAL',
      deadlineAt: '2026-04-11T12:00:00.000Z',
      latestSubmissionStatus: 'SUBMITTED',
      latestSubmissionSubmittedAt: '2026-04-11T13:00:00.000Z',
    },
    NOW,
  );

  assert.equal(overdue.status, 'OVERDUE');
  assert.equal(overdue.isOverdue, true);
  assert.equal(lateSubmitted.status, 'SUBMITTED');
  assert.equal(lateSubmitted.isOverdue, false);
  assert.equal(lateSubmitted.lateState, 'LATE');
});

test('classifies buckets through shared workflow rules', () => {
  assert.equal(
    assignmentBelongsToBucket(
      {
        status: 'RETURNED',
        sendMode: 'MANUAL',
        deadlineAt: '2026-04-13T12:00:00.000Z',
        latestSubmissionStatus: 'REVIEWED',
      },
      'sent',
      NOW,
    ),
    true,
  );

  assert.equal(
    assignmentBelongsToBucket(
      {
        status: 'RETURNED',
        sendMode: 'MANUAL',
        deadlineAt: '2026-04-10T12:00:00.000Z',
        latestSubmissionStatus: 'REVIEWED',
      },
      'overdue',
      NOW,
    ),
    true,
  );
});

test('allows reissue only from reviewed state', () => {
  const reviewed = resolveHomeworkAssignmentWorkflow(
    {
      status: 'REVIEWED',
      sendMode: 'MANUAL',
      reviewedAt: '2026-04-12T10:00:00.000Z',
      latestSubmissionStatus: 'REVIEWED',
    },
    NOW,
  );
  const inReview = resolveHomeworkAssignmentWorkflow(
    {
      status: 'IN_REVIEW',
      sendMode: 'MANUAL',
      latestSubmissionStatus: 'SUBMITTED',
    },
    NOW,
  );

  assert.equal(reviewed.canReissue, true);
  assert.equal(inReview.canReissue, false);
});

test('teacher can edit draft and scheduled assignments before issue', () => {
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'DRAFT' }), true);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'SCHEDULED' }), true);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'SENT' }), false);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'OVERDUE' }), false);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'SUBMITTED' }), false);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'IN_REVIEW' }), false);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'RETURNED' }), false);
  assert.equal(canTeacherEditHomeworkAssignment({ status: 'REVIEWED' }), false);
});

test('marks scheduled send without date as configuration error', () => {
  const workflow = resolveHomeworkAssignmentWorkflow(
    {
      status: 'SCHEDULED',
      sendMode: 'SCHEDULED',
      scheduledFor: null,
    },
    NOW,
  );

  assert.equal(workflow.hasConfigError, true);
});

test('normalizes structured review result payload', () => {
  const result = normalizeHomeworkReviewResult({
    submissionId: 7,
    generalComment: 'Нужно поправить пару моментов',
    items: {
      q1: { decision: 'ACCEPTED', score: 2, comment: null },
      q2: { decision: 'REWORK_REQUIRED', score: 0.5, comment: 'Перепроверь порядок слов' },
    },
  });

  assert.deepEqual(result, {
    submissionId: 7,
    generalComment: 'Нужно поправить пару моментов',
    items: {
      q1: { decision: 'ACCEPTED', score: 2, comment: null },
      q2: { decision: 'REWORK_REQUIRED', score: 0.5, comment: 'Перепроверь порядок слов' },
    },
  });
});
