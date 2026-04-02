import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ExternalLink, Save, RefreshCw, MessageSquare, Building } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ConfirmModal, AlertModal } from '../ui/Modal';
import { LineItem, POOrganization, SubOrganization } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { createPO, updatePO, getPOById } from '../../services/poService';
import { getSubOrganizations } from '../../services/subOrgService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useModal } from '../../hooks/useModal';

const PO_NAME_MAX_LENGTH = 30;
const TEAM_SUBCATEGORIES: Array<NonNullable<LineItem['teamSubcategory']>> = ['mechanical', 'electrical'];
const ITEM_CATEGORIES: Array<NonNullable<LineItem['itemCategory']>> = ['consumable', 'part', 'miscellaneous'];

const toDisplayLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const CreatePO: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { confirmModal, alertModal, showConfirm, showAlert, closeConfirm, closeAlert, setConfirmLoading } = useModal();
  
  const [subOrganizations, setSubOrganizations] = useState<SubOrganization[]>([]);
  const [poName, setPOName] = useState('');
  const [selectedOrganizations, setSelectedOrganizations] = useState<POOrganization[]>([]);
  const [allocationMode, setAllocationMode] = useState<'equal' | 'manual'>('equal');
  const [specialRequest, setSpecialRequest] = useState('');
  const [overBudgetJustification, setOverBudgetJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [originalPOStatus, setOriginalPOStatus] = useState<string | null>(null);
  const [originalAdminComments, setOriginalAdminComments] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      vendor: '',
      itemName: '',
      teamSubcategory: 'mechanical',
      itemCategory: 'miscellaneous',
      sku: '',
      quantity: 1,
      unitPrice: 0,
      link: '',
      notes: '',
      totalPrice: 0
    }
  ]);
  
  useEffect(() => {
    const fetchSubOrganizations = async () => {
      try {
        const orgs = await getSubOrganizations();
        setSubOrganizations(orgs);
      } catch (error) {
        console.error('Error fetching sub-organizations:', error);
      } finally {
        setLoadingOrgs(false);
      }
    };

    fetchSubOrganizations();
  }, []);

  useEffect(() => {
    // Check if we're editing an existing PO
    if (editId) {
      loadPOForEditing(editId);
    }
  }, [editId]);

  const loadPOForEditing = async (poId: string) => {
    try {
      setLoading(true);
      const po = await getPOById(poId);
      
      if (po && (po.status === 'draft' || po.status === 'declined')) {
        setIsEditing(true);
        setEditingPOId(poId);
        setOriginalPOStatus(po.status);
        setOriginalAdminComments(po.adminComments || null);
        setPOName(po.name || '');
        
        // Handle both new multi-org and legacy single org
        if (po.organizations && po.organizations.length > 0) {
          setSelectedOrganizations(po.organizations);
          setAllocationMode(po.organizations.every(org => 
            Math.abs(org.percentage - (100 / po.organizations.length)) < 0.01
          ) ? 'equal' : 'manual');
        } else if (po.subOrgId) {
          // Convert legacy single org to new format
          const legacyOrg = subOrganizations.find(org => org.id === po.subOrgId);
          if (legacyOrg) {
            setSelectedOrganizations([{
              id: '1',
              subOrgId: po.subOrgId,
              subOrgName: po.subOrgName || legacyOrg.name,
              allocatedAmount: po.totalAmount,
              percentage: 100
            }]);
          }
        }
        
        setSpecialRequest(po.specialRequest || '');
        setOverBudgetJustification(po.overBudgetJustification || '');
        const normalizedLineItems = po.lineItems.map(item => ({
          ...item,
          teamSubcategory: item.teamSubcategory || 'mechanical',
          itemCategory: item.itemCategory || 'miscellaneous'
        }));
        setLineItems(normalizedLineItems);
        
      } else {
        await showAlert({
          title: 'Error',
          message: 'PO not found or cannot be edited',
          variant: 'error'
        });
        navigate('/my-pos');
      }
    } catch (error) {
      console.error('Error loading PO for editing:', error);
      await showAlert({
        title: 'Error',
        message: 'Error loading PO for editing',
        variant: 'error'
      });
      navigate('/my-pos');
    } finally {
      setLoading(false);
    }
  };

  const addLineItem = () => {
    const newId = Date.now().toString();
    const newItem: LineItem = {
      id: newId,
      vendor: '',
      itemName: '',
      teamSubcategory: 'mechanical',
      itemCategory: 'miscellaneous',
      sku: '',
      quantity: 1,
      unitPrice: 0,
      link: '',
      notes: '',
      totalPrice: 0
    };
    setLineItems([...lineItems, newItem]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (
    id: string,
    field: keyof LineItem,
    value: string | number | LineItem['teamSubcategory'] | LineItem['itemCategory']
  ) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.totalPrice = updatedItem.quantity * updatedItem.unitPrice;
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const addOrganization = () => {
    const availableOrgs = subOrganizations.filter(org => 
      !selectedOrganizations.some(selected => selected.subOrgId === org.id)
    );
    
    if (availableOrgs.length === 0) return;
    
    const newOrg: POOrganization = {
      id: Date.now().toString(),
      subOrgId: availableOrgs[0].id,
      subOrgName: availableOrgs[0].name,
      allocatedAmount: 0,
      percentage: 0
    };
    
    const newOrganizations = [...selectedOrganizations, newOrg];
    setSelectedOrganizations(newOrganizations);
    
    // Recalculate allocations
    recalculateAllocations(newOrganizations);
  };

  const removeOrganization = (orgId: string) => {
    if (selectedOrganizations.length <= 1) return;
    
    const newOrganizations = selectedOrganizations.filter(org => org.id !== orgId);
    setSelectedOrganizations(newOrganizations);
    
    // Recalculate allocations
    recalculateAllocations(newOrganizations);
  };

  const updateOrganization = (orgId: string, field: keyof POOrganization, value: string | number) => {
    const newOrganizations = selectedOrganizations.map(org => {
      if (org.id === orgId) {
        const updated = { ...org, [field]: value };
        
        // Update sub-org name when sub-org ID changes
        if (field === 'subOrgId') {
          const selectedSubOrg = subOrganizations.find(subOrg => subOrg.id === value);
          updated.subOrgName = selectedSubOrg?.name || '';
        }
        
        // Update percentage when amount changes
        if (field === 'allocatedAmount') {
          updated.percentage = totalAmount > 0 ? ((value as number) / totalAmount) * 100 : 0;
        }
        
        return updated;
      }
      return org;
    });
    
    setSelectedOrganizations(newOrganizations);

    // Only recalculate if in equal mode (manual mode should preserve individual changes)
    if (allocationMode === 'equal') {
      recalculateAllocations(newOrganizations);
    }
  };

  // Calculate total amount from line items
  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const recalculateAllocations = (organizations: POOrganization[]) => {
    if (organizations.length === 0) return;
    
    if (allocationMode === 'equal') {
      // Equal distribution
      const amountPerOrg = totalAmount / organizations.length;
      const percentagePerOrg = 100 / organizations.length;
      
      const updatedOrganizations = organizations.map(org => ({
        ...org,
        allocatedAmount: amountPerOrg,
        percentage: percentagePerOrg
      }));
      
      setSelectedOrganizations(updatedOrganizations);
    } else {
      // Manual mode - recalculate percentages based on amounts
      const updatedOrganizations = organizations.map(org => ({
        ...org,
        percentage: totalAmount > 0 ? (org.allocatedAmount / totalAmount) * 100 : 0
      }));
      
      setSelectedOrganizations(updatedOrganizations);
    }
  };

  const toggleAllocationMode = () => {
    const newMode = allocationMode === 'equal' ? 'manual' : 'equal';
    setAllocationMode(newMode);
    
    if (newMode === 'equal') {
      recalculateAllocations(selectedOrganizations);
    }
  };

  // Recalculate allocations when total amount changes
  useEffect(() => {
    if (selectedOrganizations.length > 0) {
      recalculateAllocations(selectedOrganizations);
    }
  }, [totalAmount]);

  const handlePONameChange = (value: string) => {
    // Limit to maximum length
    if (value.length <= PO_NAME_MAX_LENGTH) {
      setPOName(value);
    }
  };
  // Calculate budget information for selected organizations
  const getTotalRemainingBudget = () => {
    return selectedOrganizations.reduce((total, org) => {
      const subOrg = subOrganizations.find(sub => sub.id === org.subOrgId);
      if (subOrg) {
        const remaining = subOrg.budgetAllocated - subOrg.budgetSpent;
        return total + remaining;
      }
      return total;
    }, 0);
  };
  
  const getOverBudgetOrganizations = () => {
    return selectedOrganizations.filter(org => {
      const subOrg = subOrganizations.find(sub => sub.id === org.subOrgId);
      if (subOrg) {
        const remaining = subOrg.budgetAllocated - subOrg.budgetSpent;
        return org.allocatedAmount > remaining;
      }
      return false;
    });
  };
  
  const totalRemainingBudget = getTotalRemainingBudget();
  const overBudgetOrgs = getOverBudgetOrganizations();
  const isOverBudget = overBudgetOrgs.length > 0;

  const sortLineItemsByVendor = (items: LineItem[]): LineItem[] => {
    return [...items].sort((a, b) => {
      // Sort alphabetically by vendor name (case-insensitive)
      const vendorA = a.vendor.toLowerCase().trim();
      const vendorB = b.vendor.toLowerCase().trim();
      
      // Handle empty vendors - put them at the end
      if (!vendorA && !vendorB) return 0;
      if (!vendorA) return 1;
      if (!vendorB) return -1;
      
      return vendorA.localeCompare(vendorB);
    });
  };

  const validateForm = async (isDraft: boolean = false) => {
    if (!poName.trim()) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please enter a name for this Purchase Order',
        variant: 'error'
      });
      return false;
    }

    if (poName.trim().length > PO_NAME_MAX_LENGTH) {
      await showAlert({
        title: 'Validation Error',
        message: `PO name must be ${PO_NAME_MAX_LENGTH} characters or less`,
        variant: 'error'
      });
      return false;
    }

    if (selectedOrganizations.length === 0) {
      await showAlert({
        title: 'Validation Error',
        message: 'Please select at least one sub-organization',
        variant: 'error'
      });
      return false;
    }
    
    // Validate allocation totals
    const totalAllocated = selectedOrganizations.reduce((sum, org) => sum + org.allocatedAmount, 0);
    if (Math.abs(totalAllocated - totalAmount) > 0.01) {
      await showAlert({
        title: 'Allocation Error',
        message: `Total allocated amount ($${totalAllocated.toFixed(2)}) must equal PO total ($${totalAmount.toFixed(2)})`,
        variant: 'error'
      });
      return false;
    }

    if (!isDraft) {
      // For submission, require at least one valid line item
      const validLineItems = lineItems.filter(item => 
        item.vendor.trim() && item.itemName.trim() && item.quantity > 0 && item.unitPrice > 0
      );

      if (validLineItems.length === 0) {
        await showAlert({
          title: 'Validation Error',
          message: 'Please add at least one valid line item',
          variant: 'error'
        });
        return false;
      }

      if (isOverBudget && !overBudgetJustification.trim()) {
        await showAlert({
          title: 'Budget Justification Required',
          message: 'Please provide justification for exceeding the budget',
          variant: 'warning'
        });
        return false;
      }
    }

    return true;
  };

  const handleSaveDraft = async () => {
    if (!currentUser || !userProfile) return;

    if (!(await validateForm(true))) return;

    setLoading(true);

    try {
      const poData: any = {
        name: poName.trim(),
        creatorId: currentUser.uid,
        creatorName: userProfile.displayName,
        organizations: selectedOrganizations,
        // Keep legacy fields for backward compatibility
        subOrgId: selectedOrganizations.length === 1 ? selectedOrganizations[0].subOrgId : null,
        subOrgName: selectedOrganizations.length === 1 ? selectedOrganizations[0].subOrgName : 
                   selectedOrganizations.map(org => org.subOrgName).join(', '),
        lineItems: lineItems, // Don't filter or sort for drafts
        totalAmount,
        status: 'draft'
      };

      // Always include specialRequest field, even if empty (to clear it)
      poData.specialRequest = specialRequest.trim() || null;

      // Always include overBudgetJustification field, even if empty (to clear it)
      poData.overBudgetJustification = overBudgetJustification.trim() || null;

      // Clear admin comments when saving as draft (especially for declined POs)
      if (originalPOStatus === 'declined') {
        poData.adminComments = null;
      }

      if (isEditing && editingPOId) {
        // Update existing draft
        await updatePO(editingPOId, poData);
        await showAlert({
          title: 'Success',
          message: 'Draft updated successfully!',
          variant: 'success'
        });
      } else {
        // Create new draft
        await createPO(poData);
        await showAlert({
          title: 'Success',
          message: 'Draft saved successfully!',
          variant: 'success'
        });
      }

      navigate('/my-pos');
    } catch (error) {
      console.error('Error saving draft:', error);
      await showAlert({
        title: 'Error',
        message: 'Error saving draft. Please try again.',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !userProfile) return;

    if (!(await validateForm(false))) return;

    setLoading(true);

    try {
      // Validate line items for submission
      const validLineItems = lineItems.filter(item => 
        item.vendor.trim() && item.itemName.trim() && item.quantity > 0 && item.unitPrice > 0
      );

      // Sort line items alphabetically by vendor before submitting
      const sortedLineItems = sortLineItemsByVendor(validLineItems);

      const poData: any = {
        name: poName.trim(),
        creatorId: currentUser.uid,
        creatorName: userProfile.displayName,
        organizations: selectedOrganizations,
        // Keep legacy fields for backward compatibility
        subOrgId: selectedOrganizations.length === 1 ? selectedOrganizations[0].subOrgId : null,
        subOrgName: selectedOrganizations.length === 1 ? selectedOrganizations[0].subOrgName : 
                   selectedOrganizations.map(org => org.subOrgName).join(', '),
        lineItems: sortedLineItems, // Use sorted line items
        totalAmount,
        status: 'pending_approval'
      };

      // Always include specialRequest field, even if empty (to clear it)
      poData.specialRequest = specialRequest.trim() || null;

      // Always include overBudgetJustification field, even if empty (to clear it)
      poData.overBudgetJustification = overBudgetJustification.trim() || null;

      // Clear admin comments when resubmitting (especially for declined POs)
      if (originalPOStatus === 'declined') {
        poData.adminComments = null;
      }

      if (isEditing && editingPOId) {
        // Update existing PO and submit
        await updatePO(editingPOId, poData);
        
        if (originalPOStatus === 'declined') {
          await showAlert({
            title: 'Success',
            message: 'Purchase Order updated and resubmitted successfully!\n\nYour PO has been sent back for admin review.\nLine items have been sorted alphabetically by vendor for easy review.',
            variant: 'success'
          });
        } else {
          await showAlert({
            title: 'Success',
            message: 'Purchase Order updated and submitted successfully!\n\nLine items have been sorted alphabetically by vendor for easy review.',
            variant: 'success'
          });
        }
      } else {
        // Create new PO
        await createPO(poData);
        await showAlert({
          title: 'Success',
          message: 'Purchase Order submitted successfully!\n\nLine items have been sorted alphabetically by vendor for easy review.',
          variant: 'success'
        });
      }

      navigate('/my-pos');
    } catch (error) {
      console.error('Error submitting PO:', error);
      await showAlert({
        title: 'Error',
        message: 'Error submitting Purchase Order. Please try again.',
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const getPageTitle = () => {
    if (!isEditing) return 'Create Purchase Order';
    if (originalPOStatus === 'declined') return 'Edit & Resubmit Purchase Order';
    return 'Edit Purchase Order';
  };

  const getBadgeInfo = () => {
    if (!isEditing) return null;
    if (originalPOStatus === 'declined') {
      return { variant: 'danger' as const, text: 'Resubmitting Declined PO' };
    }
    return { variant: 'warning' as const, text: 'Editing Draft' };
  };

  const getSubmitButtonText = () => {
    if (!isEditing) return 'Submit for Approval';
    if (originalPOStatus === 'declined') return 'Resubmit for Approval';
    return 'Update & Submit for Approval';
  };

  const getSubmitButtonIcon = () => {
    if (originalPOStatus === 'declined') return RefreshCw;
    return null;
  };

  if (loadingOrgs) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const badgeInfo = getBadgeInfo();
  const SubmitIcon = getSubmitButtonIcon();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-100">
          {getPageTitle()}
        </h1>
        {badgeInfo && (
          <Badge variant={badgeInfo.variant} size="md">
            {badgeInfo.text}
          </Badge>
        )}
      </div>

      {/* Show decline notice for declined POs being edited */}
      {originalPOStatus === 'declined' && (
        <Card className="border-red-600 bg-red-900/30">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
            <div className="flex-1">
              <h3 className="text-red-300 font-medium mb-2">This PO was previously declined</h3>
              <p className="text-red-200 text-sm mb-3">
                Please review the admin comments below and make necessary changes before resubmitting.
                Once you resubmit, it will go back to the admin for review.
              </p>
              
              {/* Show the actual decline reason */}
              {originalAdminComments && (
                <div className="bg-red-800/50 border border-red-600 rounded p-4 mb-3">
                  <div className="flex items-start space-x-2">
                    <MessageSquare className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-red-200 text-sm font-medium mb-1">Admin Comments (Reason for Decline):</p>
                      <p className="text-red-100 text-sm leading-relaxed">{originalAdminComments}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-red-800/50 border border-red-600 rounded p-3">
                <p className="text-red-200 text-sm font-medium">
                  💡 Tip: Address all concerns mentioned in the admin comments to improve approval chances.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* PO Name and Sub-Organization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Purchase Order Details</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Purchase Order Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={poName}
                  onChange={(e) => handlePONameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100 placeholder-gray-400"
                  placeholder="Enter a descriptive name for this PO"
                  required
                  maxLength={PO_NAME_MAX_LENGTH}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className={`text-xs ${
                    poName.length > PO_NAME_MAX_LENGTH * 0.8 
                      ? poName.length >= PO_NAME_MAX_LENGTH 
                        ? 'text-red-400' 
                        : 'text-yellow-400'
                      : 'text-gray-500'
                  }`}>
                    {poName.length}/{PO_NAME_MAX_LENGTH}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-400">
                  Choose a clear, descriptive name that will help identify this PO later
                </p>
                {poName.length >= PO_NAME_MAX_LENGTH && (
                  <p className="text-xs text-red-400 font-medium">
                    Maximum length reached
                  </p>
                )}
              </div>
            </div>

            {/* Multi-Organization Selection */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Sub-Organizations <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <Button
                    type="button"
                    variant={allocationMode === 'equal' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={toggleAllocationMode}
                  >
                    {allocationMode === 'equal' ? 'Switch To Manual Split' : 'Switch To Equal Split'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOrganization}
                    disabled={selectedOrganizations.length >= subOrganizations.length}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Org
                  </Button>
                </div>
              </div>
              
              {/* Allocation Mode Information */}
              <div className="mb-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                <div className="text-sm text-blue-200">
                  <p className="font-medium text-blue-300 mb-1">
                    {allocationMode === 'equal' ? 'Equal Split Mode' : 'Manual Split Mode'}
                  </p>
                  {allocationMode === 'equal' ? (
                    <p>
                      Amounts are automatically calculated and split equally based on the total of all line items. 
                      Percentages update after line items are added.
                    </p>
                  ) : (
                    <p>
                      You can manually set the amount for each organization. 
                      Percentages update after line items are added and when amounts are changed.
                    </p>
                  )}
                </div>
              </div>
              
              {selectedOrganizations.length === 0 ? (
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                  <Building className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400 mb-3">No organizations selected</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addOrganization}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Organization
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedOrganizations.map((org, index) => (
                    <div key={org.id} className="p-4 bg-gray-700 rounded-lg border border-gray-600">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div className="md:col-span-5">
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Organization
                          </label>
                          <select
                            value={org.subOrgId}
                            onChange={(e) => updateOrganization(org.id, 'subOrgId', e.target.value)}
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
                          >
                            <option value="">Select organization</option>
                            {subOrganizations
                              .filter(subOrg => 
                                subOrg.id === org.subOrgId || 
                                !selectedOrganizations.some(selected => selected.subOrgId === subOrg.id)
                              )
                              .map(subOrg => (
                                <option key={subOrg.id} value={subOrg.id}>
                                  {subOrg.name}
                                </option>
                              ))
                            }
                          </select>
                        </div>
                        
                        <div className="md:col-span-3">
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Allocated Amount
                          </label>
                          <input
  type="number"          /* still gets the numeric keyboard on mobile */
  inputMode="decimal"    /* helps Android show the right keypad */
  step="0.01"
  min="0"
  max={totalAmount}

  /* 👇  don’t pad with zeros while the user is typing */
  value={org.allocatedAmount === 0 ? '' : org.allocatedAmount}

  onChange={(e) => {
    // let the user clear the field or type partial numbers
    const val = e.target.value;
    updateOrganization(
      org.id,
      'allocatedAmount',
      val === '' ? 0 : parseFloat(val)
    );
  }}

  onBlur={(e) => {
    // once they leave the field, lock to two decimals
    const num = parseFloat(e.target.value);
    updateOrganization(
      org.id,
      'allocatedAmount',
      isNaN(num) ? 0 : Number(num.toFixed(2))
    );
  }}

  className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg
             focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100"
  placeholder="0.00"
  disabled={allocationMode === 'equal'}
/>

                        </div>
                        
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Percentage
                          </label>
                          <div className="px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-gray-300 text-center">
                            {org.percentage.toFixed(1)}%
                          </div>
                        </div>
                        
                        <div className="md:col-span-2 flex justify-end">
                          {selectedOrganizations.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOrganization(org.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Budget Status for this organization */}
                      {org.subOrgId && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                          {(() => {
                            const subOrg = subOrganizations.find(sub => sub.id === org.subOrgId);
                            if (!subOrg) return null;
                            
                            const remaining = subOrg.budgetAllocated - subOrg.budgetSpent;
                            const isOrgOverBudget = org.allocatedAmount > remaining;
                            
                            return (
                              <div className={`p-2 rounded ${isOrgOverBudget ? 'bg-red-900/30 border border-red-700' : 'bg-blue-900/30 border border-blue-700'}`}>
                                <div className="flex justify-between items-center text-sm">
                                  <span className={isOrgOverBudget ? 'text-red-300' : 'text-blue-300'}>
                                    {subOrg.name} Budget
                                  </span>
                                  <span className={isOrgOverBudget ? 'text-red-400 font-medium' : 'text-blue-400'}>
                                    ${remaining.toLocaleString()} remaining
                                  </span>
                                </div>
                                {isOrgOverBudget && (
                                  <p className="text-red-200 text-xs mt-1">
                                    Exceeds budget by ${(org.allocatedAmount - remaining).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Allocation Summary */}
                  <div className="p-3 bg-gray-600 rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-300">Total Allocated:</span>
                      <span className={`font-medium ${
                        Math.abs(selectedOrganizations.reduce((sum, org) => sum + org.allocatedAmount, 0) - totalAmount) < 0.01
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}>
                        ${selectedOrganizations.reduce((sum, org) => sum + org.allocatedAmount, 0).toFixed(2)} / ${totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Combined Budget Overview */}
            {selectedOrganizations.length > 0 && (
              <div className={`p-4 rounded-lg border ${isOverBudget ? 'bg-red-900/30 border-red-700' : 'bg-blue-900/30 border-blue-700'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-medium ${isOverBudget ? 'text-red-300' : 'text-blue-300'}`}>
                    Combined Budget Status
                  </span>
                  <Badge variant={isOverBudget ? 'danger' : 'success'}>
                    {isOverBudget ? `${overBudgetOrgs.length} org(s) over budget` : 'Within budget'}
                  </Badge>
                </div>
                <div className={`text-sm ${isOverBudget ? 'text-red-200' : 'text-blue-200'}`}>
                  Total remaining across selected organizations: ${totalRemainingBudget.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base sm:text-lg">Line Items</CardTitle>
              <p className="text-sm text-gray-400 mt-1">
                Items will be sorted alphabetically by vendor when submitted
              </p>
            </div>
          </CardHeader>
          <div className="space-y-4">
            {lineItems.map((item, index) => (
              <div key={item.id} className="relative p-4 border border-gray-600 rounded-lg bg-gray-700">
                {/* Delete button positioned at bottom left */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLineItem(item.id)}
                  disabled={lineItems.length === 1}
                  className="absolute bottom-2 left-2 p-1 text-red-400 hover:text-red-300 z-10"
                  title="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                {/* Grid layout for form fields - responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 pb-8">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">Vendor<span className="text-red-400">*</span></label> 
                    <input
                      type="text"
                      value={item.vendor}
                      onChange={(e) => updateLineItem(item.id, 'vendor', e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
                      placeholder="Vendor name"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-xs font-medium text-gray-300 mb-1">Item Name<span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) => updateLineItem(item.id, 'itemName', e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
                      placeholder="Item description"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">Team Subcategory<span className="text-red-400">*</span></label>
                    <select
                      value={item.teamSubcategory || 'mechanical'}
                      onChange={(e) => updateLineItem(item.id, 'teamSubcategory', e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100"
                    >
                      {TEAM_SUBCATEGORIES.map(option => (
                        <option key={option} value={option}>
                          {toDisplayLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">Type<span className="text-red-400">*</span></label>
                    <select
                      value={item.itemCategory || 'miscellaneous'}
                      onChange={(e) => updateLineItem(item.id, 'itemCategory', e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100"
                    >
                      {ITEM_CATEGORIES.map(option => (
                        <option key={option} value={option}>
                          {toDisplayLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">SKU (Optional)</label>
                    <input
                      type="text"
                      value={item.sku || ''}
                      onChange={(e) => updateLineItem(item.id, 'sku', e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
                      placeholder="SKU/Part #"
                    />
                  </div>
                  <div className="lg:col-span-1">
  <label className="block text-xs font-medium text-gray-300 mb-1">
    Qty<span className="text-red-400">*</span>
  </label>

  <input
    /* numeric keypad on mobile, but let the user clear/retype */
    type="number"
    inputMode="numeric"
    step="1"
    min="1"

    /* don’t force “0” while they’re typing */
    value={item.quantity === 0 ? '' : item.quantity}

    onChange={(e) => {
      const raw = e.target.value;

      // allow empty string or positive integers
      if (raw === '' || /^\d+$/.test(raw)) {
        const num = raw === '' ? 0 : parseInt(raw, 10);
        updateLineItem(item.id, 'quantity', isNaN(num) ? 0 : num);
      }
    }}

    onBlur={(e) => {
      // lock in a valid integer ⩾ 1 when the field loses focus
      let num = parseInt(e.target.value, 10);
      if (isNaN(num) || num < 1) num = 1;      // default to 1
      updateLineItem(item.id, 'quantity', num);
    }}

    className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded
               focus:ring-1 focus:ring-green-500 text-gray-100"
    placeholder="1"
  />
</div>

                  <div className="lg:col-span-1">
  <label className="block text-xs font-medium text-gray-300 mb-1">
    Unit Price<span className="text-red-400">*</span>
  </label>

  <input
    /* keep the numeric keypad on mobile */
    type="number"
    inputMode="decimal"
    step="0.01"
    min="0"

    /* don’t force trailing zeros while typing */
    value={item.unitPrice === 0 ? '' : item.unitPrice}

    onChange={(e) => {
      const val = e.target.value;

      // allow empty string or partial decimals
      const num = val === '' ? 0 : parseFloat(val);
      updateLineItem(item.id, 'unitPrice', isNaN(num) ? 0 : num);
    }}

    onBlur={(e) => {
      // round to 2 dp when the user leaves the field
      const num = parseFloat(e.target.value);
      updateLineItem(
        item.id,
        'unitPrice',
        isNaN(num) ? 0 : Number(num.toFixed(2))
      );
    }}

    className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded
               focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
    placeholder="0.00"
  />
</div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-gray-300 mb-1">Link (Optional)</label>
                    <div className="flex">
                      <input
                        type="url"
                        value={item.link}
                        onChange={(e) => updateLineItem(item.id, 'link', e.target.value)}
                        className="flex-1 px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded-l focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
                        placeholder="Product URL"
                      />
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-gray-600 border border-l-0 border-gray-500 rounded-r hover:bg-gray-500 flex items-center justify-center flex-shrink-0"
                          title="Open link"
                        >
                          <ExternalLink className="h-4 w-4 text-gray-300" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes field - spans full width */}
                <div className="mb-8">
                  <label className="block text-xs font-medium text-gray-300 mb-1">Notes (Optional)</label>
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => updateLineItem(item.id, 'notes', e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-gray-600 border border-gray-500 rounded focus:ring-1 focus:ring-green-500 text-gray-100 placeholder-gray-400"
                    placeholder="Additional notes or specifications..."
                  />
                </div>

                {/* Total price display */}
                <div className="absolute bottom-2 right-4">
                  <span className="text-base sm:text-lg font-semibold text-gray-100">
                    Total: ${item.totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
              <div className="flex justify-end">
                <Button type="button" onClick={addLineItem} variant="outline">
                  Add Item
                </Button>
              </div>
          </div>
        </Card>

        {/* Special Request */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Special Request</CardTitle>
          </CardHeader>
          <textarea
            value={specialRequest}
            onChange={(e) => setSpecialRequest(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-100 placeholder-gray-400"
            rows={3}
            placeholder="Any special instructions or requests..."
          />
          <p className="text-xs text-gray-400 mt-2">
            Leave blank if no special requests are needed. Clearing this field will remove any existing special request.
          </p>
        </Card>

        {/* Over Budget Justification */}
        {isOverBudget && (
          <Card className="border-yellow-600 bg-yellow-900/30">
            <CardHeader>
              <CardTitle className="text-yellow-300 text-base sm:text-lg">Over Budget Justification Required</CardTitle>
            </CardHeader>
            <div className="mb-4">
              <p className="text-sm text-yellow-200 mb-2">
                {overBudgetOrgs.length === 1 
                  ? `${overBudgetOrgs[0].subOrgName} exceeds budget`
                  : `${overBudgetOrgs.length} organizations exceed their budgets`
                }
              </p>
              <div className="space-y-1 mb-3">
                {overBudgetOrgs.map(org => {
                  const subOrg = subOrganizations.find(sub => sub.id === org.subOrgId);
                  const remaining = subOrg ? subOrg.budgetAllocated - subOrg.budgetSpent : 0;
                  const excess = org.allocatedAmount - remaining;
                  return (
                    <p key={org.id} className="text-xs text-yellow-300">
                      • {org.subOrgName}: ${excess.toFixed(2)} over budget
                    </p>
                  );
                })}
              </div>
              <textarea
                value={overBudgetJustification}
                onChange={(e) => setOverBudgetJustification(e.target.value)}
                className="w-full px-3 py-2 bg-yellow-900/50 border border-yellow-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-yellow-100 placeholder-yellow-300"
                rows={3}
                placeholder="Please provide justification for exceeding the budget..."
                required
              />
            </div>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-100">PO Summary</h3>
              <div className="text-sm text-gray-300 space-y-1">
                <p>{lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}</p>
                <p>{selectedOrganizations.length} organization{selectedOrganizations.length !== 1 ? 's' : ''}</p>
              </div>
              {poName && (
                <p className="text-sm text-gray-400 mt-1 truncate">Name: {poName}</p>
              )}
              {selectedOrganizations.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedOrganizations.map(org => (
                    <p key={org.id} className="text-xs text-gray-400">
                      {org.subOrgName}: ${org.allocatedAmount.toFixed(2)} ({org.percentage.toFixed(1)}%)
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xl sm:text-2xl font-bold text-gray-100">${totalAmount.toFixed(2)}</p>
              {isOverBudget && (
                <Badge variant="warning" size="sm">Over Budget</Badge>
              )}
            </div>
          </div>
        </Card>

        {/* Submit Buttons */}
        <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleSaveDraft}
            disabled={loading}
            loading={loading}
            className="w-full sm:w-auto"
          >
            <Save className="h-4 w-4 mr-2" />
            Save as Draft
          </Button>
          <Button type="submit" loading={loading} className="w-full sm:w-auto">
            {SubmitIcon && <SubmitIcon className="h-4 w-4 mr-2" />}
            {getSubmitButtonText()}
          </Button>
        </div>
      </form>

      {/* Custom Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.options.title}
        message={confirmModal.options.message}
        confirmText={confirmModal.options.confirmText}
        cancelText={confirmModal.options.cancelText}
        variant={confirmModal.options.variant}
        loading={confirmModal.loading}
      />

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