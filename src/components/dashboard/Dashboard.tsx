import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  FileText, 
  Clock, 
  CheckCircle, 
  TrendingUp,
  AlertTriangle,
  Info,
  Building,
  User,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardStats, getRecentActivity } from '../../services/dashboardService';
import { getSubOrganizations } from '../../services/subOrgService';
import { getTransactionsBySubOrg, getAllTransactions } from '../../services/transactionService';
import { getPOsByUser } from '../../services/poService';
import { SubOrganization, Transaction } from '../../types';
import { GuestDashboard } from './GuestDashboard';

interface DashboardStats {
  totalPOs: number;
  pendingPOs: number;
  approvedPOs: number;
  totalSpent: number;
}

interface ActivityItem {
  id: string;
  action: string;
  user: string;
  time: string;
}

// Keys for localStorage - only used for authenticated users with roles
const SUB_ORG_FILTER_KEY = 'dashboard_subOrg_filter';
const PO_SCOPE_FILTER_KEY = 'dashboard_po_scope_filter';

export const Dashboard: React.FC = () => {
  const { userProfile, isGuest, currentUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalPOs: 0,
    pendingPOs: 0,
    approvedPOs: 0,
    totalSpent: 0
  });
  const [subOrgs, setSubOrgs] = useState<SubOrganization[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Determine if user should have persistent filters
  const shouldPersistFilters = !isGuest && userProfile?.role && userProfile.role !== 'guest';
  
  // Filter states - only persistent for authenticated users with roles
  const [selectedSubOrg, setSelectedSubOrg] = useState<string>(() => {
    if (shouldPersistFilters) {
      return localStorage.getItem(SUB_ORG_FILTER_KEY) || 'all';
    }
    return 'all';
  });
  const [poScope, setPOScope] = useState<'organization' | 'authored'>(() => {
    if (shouldPersistFilters) {
      const saved = localStorage.getItem(PO_SCOPE_FILTER_KEY);
      return (saved as 'organization' | 'authored') || 'organization';
    }
    return 'organization';
  });

  // Filtered data states
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [filteredSubOrgs, setFilteredSubOrgs] = useState<SubOrganization[]>([]);

  // If user is a guest (including signed-in users with no roles), show the guest dashboard
  if (isGuest) {
    return <GuestDashboard />;
  }

  useEffect(() => {
    fetchDashboardData();
  }, [poScope]);

  useEffect(() => {
    fetchTransactionData();
  }, [selectedSubOrg]);

  // Save filter preferences to localStorage only for authenticated users with roles
  useEffect(() => {
    if (shouldPersistFilters) {
      localStorage.setItem(SUB_ORG_FILTER_KEY, selectedSubOrg);
    }
  }, [selectedSubOrg, shouldPersistFilters]);

  useEffect(() => {
    if (shouldPersistFilters) {
      localStorage.setItem(PO_SCOPE_FILTER_KEY, poScope);
    }
  }, [poScope, shouldPersistFilters]);

  // Clear filters when user becomes a guest or loses roles
  useEffect(() => {
    if (!shouldPersistFilters) {
      setSelectedSubOrg('all');
      setPOScope('organization');
      // Also clear any existing localStorage entries
      localStorage.removeItem(SUB_ORG_FILTER_KEY);
      localStorage.removeItem(PO_SCOPE_FILTER_KEY);
    }
  }, [shouldPersistFilters]);

  const fetchDashboardData = async () => {
    try {
      let dashboardStats;
      
      if (poScope === 'authored' && currentUser) {
        // Get user's own POs for stats
        const userPOs = await getPOsByUser(currentUser.uid);
        dashboardStats = {
          totalPOs: userPOs.length,
          pendingPOs: userPOs.filter(po => po.status === 'pending_approval').length,
          approvedPOs: userPOs.filter(po => po.status === 'approved').length,
          totalSpent: userPOs.filter(po => po.status === 'purchased').reduce((sum, po) => sum + po.totalAmount, 0)
        };
      } else {
        // Get organization-wide stats
        dashboardStats = await getDashboardStats();
      }

      const [subOrganizations, activity] = await Promise.all([
        getSubOrganizations(),
        getRecentActivity()
      ]);

      setStats(dashboardStats);
      setSubOrgs(subOrganizations);
      setRecentActivity(activity);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactionData = async () => {
    try {
      let transactions: Transaction[] = [];
      
      if (selectedSubOrg === 'all') {
        transactions = await getAllTransactions();
        setFilteredSubOrgs(subOrgs);
      } else {
        // Get all transactions and filter to include split transactions
        const allTransactions = await getAllTransactions();
        transactions = allTransactions.filter(t => {
          // Check legacy single allocation
          if (t.subOrgId === selectedSubOrg) return true;
          
          // Check split allocations
          if (t.allocations && t.allocations.length > 0) {
            return t.allocations.some(allocation => allocation.subOrgId === selectedSubOrg);
          }
          
          return false;
        });
        
        const selectedOrg = subOrgs.find(org => org.id === selectedSubOrg);
        setFilteredSubOrgs(selectedOrg ? [selectedOrg] : []);
      }
      
      setFilteredTransactions(transactions);
    } catch (error) {
      console.error('Error fetching transaction data:', error);
    }
  };

  // Update filtered data when subOrgs change
  useEffect(() => {
    if (selectedSubOrg === 'all') {
      setFilteredSubOrgs(subOrgs);
    } else {
      const selectedOrg = subOrgs.find(org => org.id === selectedSubOrg);
      setFilteredSubOrgs(selectedOrg ? [selectedOrg] : []);
    }
  }, [subOrgs, selectedSubOrg]);

  const handleSubOrgChange = (value: string) => {
    setSelectedSubOrg(value);
  };

  const handlePOScopeChange = (value: 'organization' | 'authored') => {
    setPOScope(value);
  };

  const clearFilters = () => {
    setSelectedSubOrg('all');
    setPOScope('organization');
  };

  const totalBudget = filteredSubOrgs.reduce((sum, org) => sum + org.budgetAllocated, 0);
  const initialBudget = filteredSubOrgs.reduce((sum, org) => sum + org.initialBudget, 0);
  const totalCredit = filteredSubOrgs.reduce((sum, org) => sum + org.credit, 0);
  const totalSpent = filteredSubOrgs.reduce((sum, org) => sum + org.budgetSpent, 0);
  const budgetRemaining = totalBudget - totalSpent;

  const handlePendingPOsClick = () => {
    if (userProfile?.role === 'admin') {
      navigate('/pending-approval');
    } else if (userProfile?.role === 'purchaser') {
      navigate('/pending-purchase');
    }
  };

  const handleTotalPOsClick = () => {
    if (poScope === 'authored') {
      navigate('/my-pos');
    } else if (userProfile?.role === 'admin' || userProfile?.role === 'purchaser') {
      navigate('/all-pos');
    } else {
      navigate('/my-pos');
    }
  };

  const isPendingPOsClickable = userProfile?.role === 'admin' || userProfile?.role === 'purchaser';

  // Get the appropriate label and count for pending POs based on role and scope
  const getPendingPOsInfo = () => {
    if (userProfile?.role === 'admin') {
      return {
        label: 'Pending Approval',
        count: stats.pendingPOs,
        description: stats.pendingPOs > 0 ? 'Click to review' : 'No POs awaiting approval'
      };
    } else if (userProfile?.role === 'purchaser') {
      return {
        label: 'Ready for Purchase',
        count: stats.approvedPOs,
        description: stats.approvedPOs > 0 ? 'Click to purchase' : 'No POs ready for purchase'
      };
    } else {
      return {
        label: poScope === 'authored' ? 'My Pending POs' : 'Pending POs',
        count: stats.pendingPOs,
        description: 'POs awaiting approval'
      };
    }
  };

  const pendingPOsInfo = getPendingPOsInfo();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-100">Dashboard</h1>
        <Badge variant="info" size="md">
          {userProfile?.role?.charAt(0).toUpperCase() + userProfile?.role?.slice(1)}
        </Badge>
      </div>

      {/* Filter Controls */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Building className="h-4 w-4 inline mr-1" />
                Budget View
              </label>
              <select
                value={selectedSubOrg}
                onChange={(e) => handleSubOrgChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
              >
                <option value="all" className="text-gray-100 bg-gray-700">All Organizations</option>
                {subOrgs.map(org => (
                  <option key={org.id} value={org.id} className="text-gray-100 bg-gray-700">
                    {org.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {selectedSubOrg === 'all' 
                  ? 'Showing budget data for all sub-organizations' 
                  : `Showing budget data for ${subOrgs.find(org => org.id === selectedSubOrg)?.name || 'selected organization'}`
                }
              </p>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                PO Scope
              </label>
              <select
                value={poScope}
                onChange={(e) => handlePOScopeChange(e.target.value as 'organization' | 'authored')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
              >
                <option value="organization" className="text-gray-100 bg-gray-700">Organization-wide</option>
                <option value="authored" className="text-gray-100 bg-gray-700">My POs Only</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {poScope === 'organization' 
                  ? 'Showing PO statistics for the entire organization' 
                  : 'Showing statistics for POs you have created'
                }
              </p>
            </div>
          </div>

          {/* Clear Filters Button - Now properly positioned with filter controls */}
          {(selectedSubOrg !== 'all' || poScope !== 'organization') && (
            <div className="flex justify-center">
              <button
                onClick={clearFilters}
                className="flex items-center px-4 py-2 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-700 rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Filter Summary */}
      {(selectedSubOrg !== 'all' || poScope !== 'organization') && (
        <Card className="border-blue-600 bg-blue-900/30">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-400 mt-0.5" />
            <div>
              <h3 className="text-blue-300 font-medium mb-1">Active Filters</h3>
              <div className="text-blue-200 text-sm space-y-1">
                {selectedSubOrg !== 'all' && (
                  <p>• Budget view filtered to: <strong>{subOrgs.find(org => org.id === selectedSubOrg)?.name}</strong> (includes split transactions)</p>
                )}
                {poScope !== 'organization' && (
                  <p>• PO statistics showing: <strong>Your authored POs only</strong></p>
                )}
                {shouldPersistFilters && (
                  <p className="text-xs text-blue-300 mt-2">
                    These filter preferences are saved and will persist across login sessions.
                  </p>
                )}
                {!shouldPersistFilters && (
                  <p className="text-xs text-blue-300 mt-2">
                    Filter preferences are not saved and will reset when you refresh the page.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-900/50 rounded-lg border border-green-700 flex-shrink-0">
              <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-green-400" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-400">
                {selectedSubOrg === 'all' ? 'Total Budget' : 'Budget'}
              </p>
              <p className="text-lg sm:text-2xl font-bold text-gray-100 truncate">
                ${totalBudget.toLocaleString()}
              </p>
              <p className=" sm:text-2xl font-bold text-gray-300 truncate">
                <span className="text-amber-500 text-base">${initialBudget.toLocaleString()}</span> <span className="text-base">+</span> <span className="text-green-500 text-base">${totalCredit.toLocaleString()}</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center">
            <div className="p-2 bg-red-900/50 rounded-lg border border-red-700 flex-shrink-0">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-400">Budget Spent</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-100 truncate">
                ${totalSpent.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className={`p-4 sm:p-6 ${
            isPendingPOsClickable 
              ? 'cursor-pointer hover:bg-gray-700/50 transition-colors' 
              : ''
          }`}
          onClick={isPendingPOsClickable ? handlePendingPOsClick : undefined}
        >
          <div className="flex items-center">
            <div className="p-2 bg-blue-900/50 rounded-lg border border-blue-700 flex-shrink-0">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-400 truncate">{pendingPOsInfo.label}</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-100">{pendingPOsInfo.count}</p>
              <p className="text-xs text-blue-400 mt-1 truncate">
                {pendingPOsInfo.description}
              </p>
            </div>
          </div>
        </Card>

        <Card 
          className="p-4 sm:p-6 cursor-pointer hover:bg-gray-700/50 transition-colors"
          onClick={handleTotalPOsClick}
        >
          <div className="flex items-center">
            <div className="p-2 bg-purple-900/50 rounded-lg border border-purple-700 flex-shrink-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-purple-400" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-gray-400">
                {poScope === 'authored' ? 'My POs' : 'Total POs'}
              </p>
              <p className="text-lg sm:text-2xl font-bold text-gray-100">{stats.totalPOs}</p>
              <p className="text-xs text-purple-400 mt-1 truncate">Click to view all</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Budget by Sub-Organization or Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {selectedSubOrg === 'all' ? 'Budget by Sub-Organization' : 'Recent Transactions'}
            </CardTitle>
          </CardHeader>
          <div className="space-y-3 sm:space-y-4">
            {selectedSubOrg === 'all' ? (
              // Show budget breakdown when viewing all organizations
              subOrgs.slice(0, 8).map((org) => {
                const utilization = org.budgetAllocated > 0 ? (org.budgetSpent / org.budgetAllocated) * 100 : 0;
                const isOverBudget = utilization > 100;
                const isNearLimit = utilization > 80;
                const remaining = org.budgetAllocated - org.budgetSpent;

                return (
                  <div key={org.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="font-medium text-gray-100 text-sm sm:text-base truncate">{org.name}</span>
                        {isOverBudget && (
                          <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-xs sm:text-sm text-gray-300 whitespace-nowrap ml-2">
                      ${org.budgetSpent.toLocaleString()} / ${org.budgetAllocated.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isOverBudget 
                            ? 'bg-red-500' 
                            : isNearLimit 
                              ? 'bg-yellow-500' 
                              : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{utilization.toFixed(1)}% utilized</span>
                      <span className={utilization > 100 ? 'text-red-400 font-medium' : 'text-gray-300'}>
                        ${remaining.toLocaleString()} remaining
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              // Show recent transactions for selected organization
              filteredTransactions.slice(0, 6).length > 0 ? (
                filteredTransactions.slice(0, 6).map((transaction) => (
                  <div key={transaction.id} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-100 truncate">{transaction.description}</p>
                      <p className="text-xs text-gray-400">
                        {transaction.postDate.toLocaleDateString()}
                        {transaction.notes && ` • ${transaction.notes}`}
                      </p>
                    </div>
                    <div className="ml-2 text-right">
                      {transaction.allocations && transaction.allocations.length > 0 ? (
                        transaction.allocations.length === 1 ? (
                          <div className="text-right">
                            <span className="text-gray-300 text-sm">{transaction.allocations[0].subOrgName}</span>
                            <p className="text-sm font-medium text-red-400">${transaction.allocations[0].amount.toFixed(2)}</p>
                          </div>
                        ) : (
                          <div className="text-right">
                            <Badge variant="info" size="sm">Split ({transaction.allocations.length})</Badge>
                            {selectedSubOrg !== 'all' && (
                              <p className="text-sm font-medium text-red-400 mt-1">
                                ${transaction.allocations.find(a => a.subOrgId === selectedSubOrg)?.amount.toFixed(2) || '0.00'}
                              </p>
                            )}
                          </div>
                        )
                      ) : transaction.subOrgName ? (
                        <div className="text-right">
                          <span className="text-gray-300 text-sm">{transaction.subOrgName}</span>
                          <p className="text-sm font-medium text-red-400">${transaction.debitAmount.toFixed(2)}</p>
                        </div>
                      ) : (
                        <div className="text-right">
                          <Badge variant="warning" size="sm">Unallocated</Badge>
                          <p className="text-sm font-medium text-red-400">${transaction.debitAmount.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm">No transactions found</p>
                  <p className="text-gray-500 text-xs mt-1">
                    No spending recorded for this organization
                  </p>
                </div>
              )
            )}
            {selectedSubOrg === 'all' && subOrgs.length > 8 && (
              <div className="text-center pt-2">
                <span className="text-sm text-gray-400">
                  +{subOrgs.length - 8} more organizations
                </span>
              </div>
            )}
            {selectedSubOrg !== 'all' && filteredTransactions.length > 6 && (
              <div className="text-center pt-2">
                <button 
                  onClick={() => navigate('/transactions')}
                  className="text-sm text-green-400 hover:text-green-300 transition-colors"
                >
                  View all {filteredTransactions.length} transactions →
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <div className="space-y-3 sm:space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className="p-1 bg-green-900/50 rounded-full mt-1 border border-green-700 flex-shrink-0">
                    <CheckCircle className="h-2 w-2 sm:h-3 sm:w-3 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">{activity.action}</p>
                    <p className="text-xs text-gray-400 truncate">by {activity.user}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{activity.time}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-400 text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      
    </div>
  );
};