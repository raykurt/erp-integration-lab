'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Nav } from '@/components/Nav';
import { Alert, Status } from '@/components/Status';
import { api, errorText } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LeaveRequest } from '@/lib/types';

export default function LeavePage() {
  const { me, reload: reloadMe } = useSession();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRequests(await api<LeaveRequest[]>('/leave-requests'));
  }, []);

  useEffect(() => {
    if (me) load().catch((e) => setError(errorText(e)));
  }, [me, load]);

  /** Runs an action, shows success or the API's error message, then refreshes the data. */
  async function run(action: () => Promise<unknown>, success: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await Promise.all([load(), reloadMe()]);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const ok = await run(
      () =>
        api('/leave-requests', {
          method: 'POST',
          body: {
            type: form.get('type'),
            startDate: form.get('startDate'),
            endDate: form.get('endDate'),
            ...(form.get('note') ? { note: form.get('note') } : {}),
          },
        }),
      'Leave request submitted',
    );
    if (ok) formEl.reset();
  }

  async function reject(e: FormEvent<HTMLFormElement>, id: number) {
    e.preventDefault();
    const reason = new FormData(e.currentTarget).get('reason');
    if (await run(() => api(`/leave-requests/${id}/reject`, { method: 'POST', body: { reason } }), 'Request rejected')) {
      setRejecting(null);
    }
  }

  if (!me) return <main className="muted">Loading…</main>;

  const mine = requests.filter((r) => r.employeeId === me.id);
  const team = requests.filter((r) => r.employeeId !== me.id);
  const canDecide = me.role === 'MANAGER' || me.role === 'HR';

  return (
    <>
      <Nav me={me} />
      <main>
        <h1>Leave</h1>
        <p className="muted">
          Annual leave balance: <strong data-testid="balance">{me.annualLeaveBalance}</strong> working days
        </p>
        <Alert message={error} />
        <Alert message={notice} kind="success" />

        <section className="card" aria-labelledby="new-request">
          <h2 id="new-request">New request</h2>
          <form className="grid" onSubmit={submit}>
            <label>
              Leave type
              <select name="type" defaultValue="ANNUAL">
                <option value="ANNUAL">Annual</option>
                <option value="SICK">Sick</option>
                <option value="UNPAID">Unpaid</option>
              </select>
            </label>
            <label>
              Start date
              <input name="startDate" type="date" required />
            </label>
            <label>
              End date
              <input name="endDate" type="date" required />
            </label>
            <label>
              Note
              <input name="note" maxLength={500} />
            </label>
            <button type="submit">Submit request</button>
          </form>
        </section>

        <section className="card" aria-labelledby="my-requests">
          <h2 id="my-requests">My requests</h2>
          <RequestTable
            rows={mine}
            testId="my-request"
            actions={(r) =>
              (r.status === 'PENDING' || r.status === 'APPROVED') && (
                <button className="secondary" onClick={() => run(() => api(`/leave-requests/${r.id}/cancel`, { method: 'POST' }), 'Request cancelled')}>
                  Cancel
                </button>
              )
            }
          />
        </section>

        {canDecide && (
          <section className="card" aria-labelledby="team-requests">
            <h2 id="team-requests">{me.role === 'HR' ? 'All requests' : 'Team requests'}</h2>
            <RequestTable
              rows={team}
              testId="team-request"
              showEmployee
              actions={(r) =>
                r.status === 'PENDING' &&
                (rejecting === r.id ? (
                  <form className="actions" onSubmit={(e) => reject(e, r.id)}>
                    <input name="reason" aria-label="Rejection reason" placeholder="Reason" required minLength={3} />
                    <button className="danger" type="submit">Confirm reject</button>
                  </form>
                ) : (
                  <>
                    <button onClick={() => run(() => api(`/leave-requests/${r.id}/approve`, { method: 'POST' }), 'Request approved')}>Approve</button>
                    <button className="secondary" onClick={() => setRejecting(r.id)}>Reject</button>
                  </>
                ))
              }
            />
          </section>
        )}
      </main>
    </>
  );
}

function RequestTable(props: {
  rows: LeaveRequest[];
  testId: string;
  showEmployee?: boolean;
  actions: (r: LeaveRequest) => React.ReactNode;
}) {
  if (props.rows.length === 0) return <p className="empty">No requests yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {props.showEmployee && <th>Employee</th>}
            <th>Dates</th>
            <th>Type</th>
            <th className="num">Working days</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.id} data-testid={props.testId}>
              {props.showEmployee && <td>{r.employee?.fullName}</td>}
              <td>
                {r.startDate} → {r.endDate}
              </td>
              <td>{r.type}</td>
              <td className="num" data-testid="working-days">{r.workingDays}</td>
              <td>
                <Status value={r.status} />
              </td>
              <td data-testid="reason">{r.decisionReason ?? ''}</td>
              <td>
                <div className="actions">{props.actions(r)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
