        ? currentProcessingStatus
        : '',
    );
    setLateDocuments(receipt.lateDocuments.join('\n'));
    setNotice('');
    setError('');
  };
  const departmentReturn = selected?.final_status === 'Returned to Department Approver';
  const departmentPending = selected?.final_status === 'Pending Department Approval';
  const departmentStage = departmentPending || departmentReturn;
  const choices = selected
    ? departmentStage && department
      ? [
          {
            value: 'department_approve',
            label: departmentReturn
              ? 'Re-approve and return to Finance'
              : 'Approve and send to Finance',
          },
          { value: 'department_reject', label: 'Return to Requestor for correction' },
        ]
      : financeMember
        ? financeActionOptions(selected.final_status)
        : []
    : [];
  const departmentAction = action.startsWith('department_');
  const needsTarget = action === 'payment_processing';

  const save = async () => {
    if (!selected || !action) return;
    if (needsTarget && !checkDate && !selected.planned_check_date) {
      setError('A target release date is required before processing can begin.');
      return;
    }
    if (
      ['department_reject', 'member_reject', 'request_documents'].includes(action) &&
      !remarks.trim()
    ) {
      setError('Remarks are required for return, decline, or document-request actions.');
      return;
    }
    if (
      action === 'member_approve' &&
      (!originalsDate || documentVerification !== 'Complete')
    ) {
      setError('Record the original documents received date and mark verification Complete before approving.');
      return;
    }
    if (
      action === 'member_approve' &&
      documentVerification === 'Incomplete' &&
      !verificationRemarks.trim()
    ) {
      setError('Describe the missing or incomplete documents before continuing.');
      return;
    }
    if (
      !departmentAction &&
      selected.planned_check_date &&
      checkDate !== selected.planned_check_date &&
      !reason.trim()
    ) {
      setError('Add a reason for changing the planned release date.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (departmentAction)
        await post('department/action', {
          requestId: selected.id,
          decision: action === 'department_approve' ? 'approve' : 'reject',
          remarks,
        });
      else
        await post('finance/action', {
          requestId: selected.id,
          action,
          remarks,
          plannedCheckDate: checkDate || null,
          changeReason: reason || null,
          originalsReceivedDate: action === 'member_approve' ? originalsDate : null,
          documentVerification: action === 'member_approve' ? documentVerification : null,
          verificationRemarks: action === 'member_approve' ? verificationRemarks : null,
        });
      setSelected(undefined);
      setAction('');
      setRemarks('');
      setCheckDate('');
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveFinanceUpdates = async () => {
    if (!selected || !finance) return;
    if (requiresOriginals(selected) && documentVerification === 'Complete' && !originalsDate) {
      setError('Record the original documents received date before marking them complete.');
      return;
    }
    if (
      requiresOriginals(selected) &&
      documentVerification === 'Incomplete' &&
      !verificationRemarks.trim()
    ) {
      setError('Describe the missing or incomplete documents.');
      return;
    }
    if (
      selected.planned_check_date &&
      checkDate !== selected.planned_check_date &&
      !reason.trim()
    ) {
      setError('Add a reason for changing the planned release date.');
      return;
    }
    setUpdateBusy(true);