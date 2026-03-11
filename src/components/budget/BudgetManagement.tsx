import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { AlertModal } from '../ui/Modal';
import { Edit, Save, X, AlertTriangle, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { getSubOrganizations, updateSubOrgBudget } from '../../services/subOrgService';
import { SubOrganization } from '../../types';
import { useModal } from '../../hooks/useModal';
import * as XLSX from 'xlsx';

type EditField = 'initialBudget' | 'credit';

interface EditState {
  id: string;
  field: EditField;
  value: string;
}

export const BudgetManagement: React.FC = () => {
  const { alertModal, showAlert, closeAlert } = useModal();
  const [budgets, setBudgets] = useState<SubOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    const fetchBudgets = async () => {
      try {
        const subOrgs = await getSubOrganizations();
        setBudgets(subOrgs);
      } catch (error) {
        console.error('Error fetching budgets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBudgets();
  }, []);

  const startEdit = (id: string, field: EditField, currentValue: number) => {
    setEditState({ id, field, value: currentValue.toString() });
  };

  const cancelEdit = () => {
    setEditState(null);
  };

  const saveEdit = async (id: string) => {
    if (!editState) return;

    const newValue = parseFloat(editState.value);
    if (isNaN(newValue) || newValue < 0) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please enter a valid positive number',
        variant: 'error'
      });
      return;
    }

    try {
      const budget = budgets.find(b => b.id === id);
      if (!budget) return;

      if (editState.field === 'initialBudget') {
        // budgetAllocated = initialBudget + credit
        const newAllocated = newValue + (budget.credit ?? 0);
        await updateSubOrgBudget(id, newAllocated, undefined, newValue, budget.credit);
        setBudgets(budgets.map(b =>
          b.id === id
            ? { ...b, initialBudget: newValue, budgetAllocated: newAllocated }
            : b
        ));
      } else {
        // credit field
        const newAllocated = (budget.initialBudget ?? budget.budgetAllocated) + newValue;
        await updateSubOrgBudget(id, newAllocated, undefined, budget.initialBudget, newValue);
        setBudgets(budgets.map(b =>
          b.id === id
            ? { ...b, credit: newValue, budgetAllocated: newAllocated }
            : b
        ));
      }

      setEditState(null);

      await showAlert({
        title: 'Success',
        message: 'Budget updated successfully',
        variant: 'success'
      });
    } catch (error) {
      console.error('Error updating budget:', error);
      await showAlert({
        title: 'Error',
        message: 'Error updating budget. Please try again.',
        variant: 'error'
      });
    }
  };

  const handleExportBudgetReport = async () => {
    setExportLoading(true);
    try {
      const totalAllocated = budgets.reduce((sum, budget) => sum + budget.budgetAllocated, 0);
      const totalSpent = budgets.reduce((sum, budget) => sum + budget.budgetSpent, 0);
      const totalRemaining = totalAllocated - totalSpent;
      const totalCredit = budgets.reduce((sum, budget) => sum + (budget.credit ?? 0), 0);

      const summaryData = [
        {
          'Metric': 'Total Initial Budget',
          'Amount': `$${budgets.reduce((s, b) => s + (b.initialBudget ?? b.budgetAllocated), 0).toLocaleString()}`,
          'Percentage': '-'
        },
        {
          'Metric': 'Total Credits',
          'Amount': `$${totalCredit.toLocaleString()}`,
          'Percentage': '-'
        },
        {
          'Metric': 'Total Budget Allocated',
          'Amount': `$${totalAllocated.toLocaleString()}`,
          'Percentage': '100.0%'
        },
        {
          'Metric': 'Total Budget Spent',
          'Amount': `$${totalSpent.toLocaleString()}`,
          'Percentage': `${totalAllocated > 0 ? ((totalSpent / totalAllocated) * 100).toFixed(1) : 0}%`
        },
        {
          'Metric': 'Total Budget Remaining',
          'Amount': `$${totalRemaining.toLocaleString()}`,
          'Percentage': `${totalAllocated > 0 ? ((totalRemaining / totalAllocated) * 100).toFixed(1) : 0}%`
        }
      ];

      const budgetData = budgets.map(budget => {
        const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
        const remaining = budget.budgetAllocated - budget.budgetSpent;
        const status = utilization > 100 ? 'Over Budget' :
                     utilization > 90 ? 'Critical' :
                     utilization > 75 ? 'Warning' : 'Good';

        return {
          'Sub-Organization': budget.name,
          'Initial Budget': budget.initialBudget ?? budget.budgetAllocated,
          'Credit': budget.credit ?? 0,
          'Budget Allocated': budget.budgetAllocated,
          'Budget Spent': budget.budgetSpent,
          'Budget Remaining': remaining,
          'Utilization %': parseFloat(utilization.toFixed(1)),
          'Status': status,
          'Allocated (Formatted)': `$${budget.budgetAllocated.toLocaleString()}`,
          'Spent (Formatted)': `$${budget.budgetSpent.toLocaleString()}`,
          'Remaining (Formatted)': `$${remaining.toLocaleString()}`
        };
      });

      budgetData.sort((a, b) => b['Utilization %'] - a['Utilization %']);

      const alertsData = budgets
        .filter(budget => {
          const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
          return utilization > 75;
        })
        .map(budget => {
          const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
          const remaining = budget.budgetAllocated - budget.budgetSpent;

          return {
            'Sub-Organization': budget.name,
            'Alert Type': utilization > 100 ? 'Over Budget' : 'High Usage',
            'Utilization %': parseFloat(utilization.toFixed(1)),
            'Amount Over/Under': remaining < 0 ? `$${Math.abs(remaining).toLocaleString()} over` : `$${remaining.toLocaleString()} remaining`,
            'Priority': utilization > 100 ? 'High' : 'Medium',
            'Recommendation': utilization > 100 ? 'Immediate attention required' : 'Monitor closely'
          };
        });

      const wb = XLSX.utils.book_new();

      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Budget Summary');

      const budgetWs = XLSX.utils.json_to_sheet(budgetData);
      budgetWs['!cols'] = [
        { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(wb, budgetWs, 'Detailed Budgets');

      if (alertsData.length > 0) {
        const alertsWs = XLSX.utils.json_to_sheet(alertsData);
        alertsWs['!cols'] = [
          { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, alertsWs, 'Budget Alerts');
      }

      const date = new Date().toISOString().split('T')[0];
      const filename = `budget_report_${date}.xlsx`;
      XLSX.writeFile(wb, filename);

      await showAlert({
        title: 'Export Successful',
        message: `Budget report has been exported successfully as "${filename}". The report includes budget summary, detailed breakdowns, and any budget alerts.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error exporting budget report:', error);
      await showAlert({
        title: 'Export Error',
        message: 'Error generating budget report. Please try again.',
        variant: 'error'
      });
    } finally {
      setExportLoading(false);
    }
  };

  const totalAllocated = budgets.reduce((sum, budget) => sum + budget.budgetAllocated, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.budgetSpent, 0);
  const totalRemaining = totalAllocated - totalSpent;

  const getBudgetStatus = (budget: SubOrganization) => {
    const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;

    if (utilization > 100) return { status: 'over', color: 'red', label: 'Over Budget' };
    if (utilization > 90) return { status: 'critical', color: 'red', label: 'Critical' };
    if (utilization > 75) return { status: 'warning', color: 'yellow', label: 'Warning' };
    return { status: 'good', color: 'green', label: 'Good' };
  };

  const EditableCell: React.FC<{
    budget: SubOrganization;
    field: EditField;
    value: number;
  }> = ({ budget, field, value }) => {
    const isEditing = editState?.id === budget.id && editState?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center justify-end space-x-2">
          <input
            type="number"
            value={editState.value}
            onChange={(e) => setEditState({ ...editState, value: e.target.value })}
            className="w-24 px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100"
            min="0"
            step="100"
            autoFocus
          />
          <Button size="sm" onClick={() => saveEdit(budget.id)} className="p-1">
            <Save className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelEdit} className="p-1">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-end space-x-2 group">
        <span className="font-medium text-gray-100">${value.toLocaleString()}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startEdit(budget.id, field, value)}
          className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Edit className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-100">Budget Management</h1>
        <Button
          variant="outline"
          onClick={handleExportBudgetReport}
          loading={exportLoading}
          disabled={exportLoading}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Budget Report
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-blue-900/50 rounded-lg border border-blue-700">
              <TrendingUp className="h-6 w-6 text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Total Allocated</p>
              <p className="text-2xl font-bold text-gray-100">
                ${totalAllocated.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-red-900/50 rounded-lg border border-red-700">
              <TrendingDown className="h-6 w-6 text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Total Spent</p>
              <p className="text-2xl font-bold text-gray-100">
                ${totalSpent.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 bg-green-900/50 rounded-lg border border-green-700">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-400">Remaining</p>
              <p className="text-2xl font-bold text-gray-100">
                ${totalRemaining.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Budget Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sub-Organization Budgets</CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left py-3 px-4 font-medium text-gray-200">Sub-Organization</th>
                <th className="text-right py-3 px-4 font-medium text-gray-200">
                  Initial Budget
                  <span className="ml-1 text-xs text-gray-400 font-normal">(editable)</span>
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-200">
                  Credit
                  <span className="ml-1 text-xs text-gray-400 font-normal">(editable)</span>
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-200">Allocated Budget</th>
                <th className="text-right py-3 px-4 font-medium text-gray-200">Spent</th>
                <th className="text-right py-3 px-4 font-medium text-gray-200">Remaining</th>
                <th className="text-center py-3 px-4 font-medium text-gray-200">Utilization</th>
                <th className="text-center py-3 px-4 font-medium text-gray-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => {
                const status = getBudgetStatus(budget);
                const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
                const remaining = budget.budgetAllocated - budget.budgetSpent;
                const initialBudget = budget.initialBudget ?? budget.budgetAllocated;
                const credit = budget.credit ?? 0;

                return (
                  <tr key={budget.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-4 px-4">
                      <div className="font-medium text-gray-100">{budget.name}</div>
                    </td>

                    {/* Initial Budget — editable */}
                    <td className="py-4 px-4 text-right">
                      <EditableCell budget={budget} field="initialBudget" value={initialBudget} />
                    </td>

                    {/* Credit — editable */}
                    <td className="py-4 px-4 text-right">
                      <EditableCell budget={budget} field="credit" value={credit} />
                    </td>

                    {/* Allocated Budget — read-only, derived */}
                    <td className="py-4 px-4 text-right">
                      <span className="font-medium text-gray-400">${budget.budgetAllocated.toLocaleString()}</span>
                    </td>

                    <td className="py-4 px-4 text-right text-gray-300">
                      ${budget.budgetSpent.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={remaining < 0 ? 'text-red-400 font-medium' : 'text-gray-100'}>
                        ${remaining.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center">
                        <div className="w-16 bg-gray-600 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              status.status === 'over' || status.status === 'critical'
                                ? 'bg-red-500'
                                : status.status === 'warning'
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-300 min-w-[3rem]">
                          {utilization.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Badge
                        variant={
                          status.status === 'over' || status.status === 'critical'
                            ? 'danger'
                            : status.status === 'warning'
                              ? 'warning'
                              : 'success'
                        }
                        size="sm"
                      >
                        {status.status === 'over' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {status.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Budget Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-gray-100">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
            Budget Alerts
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          {budgets
            .filter(budget => {
              const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
              return utilization > 75;
            })
            .map(budget => {
              const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
              const remaining = budget.budgetAllocated - budget.budgetSpent;

              return (
                <div key={budget.id} className="flex items-center justify-between p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                  <div className="flex items-center">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 mr-2" />
                    <span className="font-medium text-yellow-200">{budget.name}</span>
                    <span className="text-yellow-300 ml-2">
                      {utilization > 100
                        ? `Over budget by $${Math.abs(remaining).toLocaleString()}`
                        : `${utilization.toFixed(0)}% of budget used`
                      }
                    </span>
                  </div>
                  <Badge variant={utilization > 100 ? 'danger' : 'warning'} size="sm">
                    {utilization > 100 ? 'Over Budget' : 'High Usage'}
                  </Badge>
                </div>
              );
            })}
          {budgets.filter(budget => {
            const utilization = budget.budgetAllocated > 0 ? (budget.budgetSpent / budget.budgetAllocated) * 100 : 0;
            return utilization > 75;
          }).length === 0 && (
            <div className="text-center py-4 text-gray-400">
              No budget alerts at this time
            </div>
          )}
        </div>
      </Card>

      {/* Export Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Export Information</CardTitle>
        </CardHeader>
        <div className="space-y-3 text-sm text-gray-300">
          <p><strong className="text-gray-200">Budget Report Contents:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Budget Summary:</strong> Overall totals and percentages, including initial budgets and credits</li>
            <li><strong>Detailed Budgets:</strong> Complete breakdown by sub-organization with utilization metrics</li>
            <li><strong>Budget Alerts:</strong> Organizations with high usage or over-budget status (if any)</li>
          </ul>
          <p className="mt-4"><strong className="text-gray-200">File Format:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Excel (.xlsx) format with multiple worksheets</li>
            <li>Formatted for easy reading and analysis</li>
            <li>Includes both raw numbers and formatted currency values</li>
            <li>Sorted by utilization percentage for quick identification of issues</li>
          </ul>
        </div>
      </Card>

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={closeAlert}
        title={alertModal.options.title}
        message={alertModal.options.message}
        variant={alertModal.options.variant}
      />
    </div>
  );
};