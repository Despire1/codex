import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTeacherDeleteHomeworkTemplate,
  canTeacherEditHomeworkTemplate,
} from './workflow';

test('teacher can edit only templates without issued assignments', () => {
  assert.equal(canTeacherEditHomeworkTemplate({ issuedAssignmentsCount: 0 } as any), true);
  assert.equal(canTeacherEditHomeworkTemplate({ issuedAssignmentsCount: 2 } as any), false);
});

test('teacher can delete reviewed template when backend marks it as deletable', () => {
  assert.equal(
    canTeacherDeleteHomeworkTemplate({
      issuedAssignmentsCount: 3,
      canTeacherEdit: false,
      canTeacherDelete: true,
    } as any),
    true,
  );

  assert.equal(
    canTeacherDeleteHomeworkTemplate({
      issuedAssignmentsCount: 3,
      canTeacherEdit: false,
      canTeacherDelete: false,
    } as any),
    false,
  );
});
