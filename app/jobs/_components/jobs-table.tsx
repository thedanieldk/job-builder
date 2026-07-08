// app/jobs/_components/jobs-table.tsx
"use client"; // Mark as Client Component for state and interaction

// Import Actions and UI Components
import { createJob, deleteJob, updateJob } from "@/actions/jobs-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JobStatus } from "@/db/schema/jobs-schema";
import { motion } from "framer-motion";
import { Check, Edit2, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { useState, SubmitEvent } from "react";

// Shape of a single row in the table. Mirrors the "jobs" drizzle schema.
export interface Job {
  id: number;
  company: string;
  industry: string | null;
  salary: string | null;
  location: string | null;
  contact: string | null;
  applied: boolean;
  status: JobStatus;
  website: string | null;
  notes: string | null;
  jobLink: string | null;
}

interface JobsTableProps {
  initialJobs: Job[]; // Data passed down from the parent page (fetched via getJobs)
}

// All possible status options, used to populate the <select> in the form
const STATUS_OPTIONS: JobStatus[] = ["Not Applied", "Applied", "Interviewing", "Offer", "Rejected", "Ghosted"];

// Tailwind color classes for each status "pill", so it's easy to scan the table at a glance
const STATUS_STYLES: Record<JobStatus, string> = {
  "Not Applied": "bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300",
  Applied: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  Interviewing: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  Offer: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  Ghosted: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

// Shared styling for the native <select> so it visually matches the shadcn Input component
const SELECT_CLASSNAME =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

// The editable fields for the create/edit form. Text fields use "" instead of null
// so they work as controlled inputs; we convert "" back to null before saving.
const EMPTY_FORM_DATA = {
  company: "",
  industry: "",
  salary: "",
  location: "",
  contact: "",
  applied: false,
  status: "Not Applied" as JobStatus,
  website: "",
  notes: "",
  jobLink: "",
};

// Small helper to render a link cell (Website / Job Link columns)
// Shows a dash when there's no value, otherwise an icon link that opens in a new tab
const LinkCell = ({ href, label }: { href: string | null; label: string }) => {
  if (!href) {
    return <span className="text-gray-400 dark:text-gray-600">—</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
      title={label}
    >
      <ExternalLink className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </a>
  );
};

export const JobsTable = ({ initialJobs }: JobsTableProps) => {
  // Initialize component state with the data passed down from the server
  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  // --- State for Create/Edit Form ---
  const [isFormOpen, setIsFormOpen] = useState(false); // Dialog visibility
  const [formData, setFormData] = useState(EMPTY_FORM_DATA); // Form field values
  const [isSubmitting, setIsSubmitting] = useState(false); // Loading state during submission
  const [error, setError] = useState<string | null>(null); // Error message state
  const [editingId, setEditingId] = useState<number | null>(null); // null when creating, number (ID) when editing

  // --- State for Deletion ---
  const [deletingId, setDeletingId] = useState<number | null>(null); // ID of job to delete
  const [isDeleting, setIsDeleting] = useState(false); // Deletion loading state
  const [deleteError, setDeleteError] = useState<string | null>(null); // Deletion error state

  // --- Event Handlers ---
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      // Checkboxes report their value via "checked", not "value"
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prevData) => ({ ...prevData, [name]: checked }));
    } else {
      setFormData((prevData) => ({ ...prevData, [name]: value }));
    }
  };

  // Populate the form with an existing job's data and open the dialog in edit mode
  const handleEditClick = (jobToEdit: Job) => {
    setEditingId(jobToEdit.id); // Store the ID of the job being edited
    setFormData({
      company: jobToEdit.company,
      industry: jobToEdit.industry ?? "",
      salary: jobToEdit.salary ?? "",
      location: jobToEdit.location ?? "",
      contact: jobToEdit.contact ?? "",
      applied: jobToEdit.applied,
      status: jobToEdit.status,
      website: jobToEdit.website ?? "",
      notes: jobToEdit.notes ?? "",
      jobLink: jobToEdit.jobLink ?? "",
    });
    setError(null); // Clear errors
    setIsFormOpen(true); // Open the dialog
  };

  const resetAndCloseForm = () => {
    setIsFormOpen(false); // Close dialog
    setFormData(EMPTY_FORM_DATA); // Reset form fields
    setError(null); // Clear any previous errors
    setIsSubmitting(false); // Reset submitting state
    setEditingId(null); // Reset editingId when closing/resetting
  };

  // Turn the form's "" placeholders back into null for optional fields before saving,
  // so empty cells render as "—" instead of a blank string in the table.
  const buildPayload = () => ({
    company: formData.company,
    industry: formData.industry.trim() === "" ? null : formData.industry,
    salary: formData.salary.trim() === "" ? null : formData.salary,
    location: formData.location.trim() === "" ? null : formData.location,
    contact: formData.contact.trim() === "" ? null : formData.contact,
    applied: formData.applied,
    status: formData.status,
    website: formData.website.trim() === "" ? null : formData.website,
    notes: formData.notes.trim() === "" ? null : formData.notes,
    jobLink: formData.jobLink.trim() === "" ? null : formData.jobLink,
  });

  // Handle form submission for creating or updating a job
  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent standard form submission/page reload
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = buildPayload();
      if (editingId !== null) {
        // --- UPDATE PATH ---
        const updatedJob = await updateJob({ id: editingId, ...payload });
        // Replace the old version of the job with the updated one
        setJobs((prevJobs) => prevJobs.map((j) => (j.id === editingId ? updatedJob : j)));
      } else {
        // --- CREATE PATH ---
        const newJob = await createJob(payload);
        // Prepend the new job to the existing array
        setJobs((prevJobs) => [newJob, ...prevJobs]);
      }
      resetAndCloseForm(); // Close dialog and reset form on success
    } catch (err) {
      console.error("Save Job Error:", err);
      setError(err instanceof Error ? err.message : "Failed to save job.");
      setIsSubmitting(false); // Important: Reset loading state on error
    }
  };

  // --- Deletion Handlers ---
  const handleOpenDeleteDialog = (id: number) => {
    setDeletingId(id); // Set the ID to trigger the dialog opening
    setDeleteError(null); // Clear any previous delete errors
  };

  const handleCloseDeleteDialog = () => {
    // Prevent closing if deletion is in progress
    if (!isDeleting) {
      setDeletingId(null);
      setDeleteError(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deletingId === null) return; // Exit if no ID is set

    setIsDeleting(true); // Set loading state
    setDeleteError(null);

    try {
      await deleteJob(deletingId);
      // Update local state by removing the deleted job
      setJobs((prevJobs) => prevJobs.filter((j) => j.id !== deletingId));
      setDeletingId(null);
      setIsDeleting(false);
    } catch (err) {
      console.error("Delete Job Error:", err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete job.");
      setIsDeleting(false); // Reset loading state on error
      // Keep dialog open to show error by not setting deletingId to null here
    }
  };

  return (
    <>
      {/* Create/Edit Button and Dialog Setup */}
      <div className="mb-6 flex justify-end">
        <Dialog
          open={isFormOpen}
          onOpenChange={(open) => {
            if (!open) resetAndCloseForm();
            else setIsFormOpen(open);
          }}
          disablePointerDismissal={isSubmitting}
        >
          <DialogTrigger
            render={
              <Button
                onClick={() => {
                  setEditingId(null); // Ensure create mode
                  resetAndCloseForm();
                  setIsFormOpen(true);
                }}
                className="gap-2"
              />
            }
          >
            <Plus className="w-5 h-5" /> Add Job
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] md:max-w-[650px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Job" : "Add New Job"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Make changes to this job." : "Enter the details for the job you're tracking."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="company" className="text-right">Company</Label>
                <Input id="company" name="company" value={formData.company} onChange={handleInputChange} required className="col-span-3" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="industry" className="text-right">Industry</Label>
                <Input id="industry" name="industry" value={formData.industry} onChange={handleInputChange} className="col-span-3" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="salary" className="text-right">Salary</Label>
                <Input id="salary" name="salary" value={formData.salary} onChange={handleInputChange} className="col-span-3" placeholder="e.g. $100k - $120k" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right">Location</Label>
                <Input id="location" name="location" value={formData.location} onChange={handleInputChange} className="col-span-3" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="contact" className="text-right">Contact</Label>
                <Input id="contact" name="contact" value={formData.contact} onChange={handleInputChange} className="col-span-3" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="applied" className="text-right">Applied?</Label>
                <input
                  id="applied"
                  name="applied"
                  type="checkbox"
                  checked={formData.applied}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                  className="col-span-3 h-4 w-4 justify-self-start accent-blue-600"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">Status</Label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                  className={`col-span-3 ${SELECT_CLASSNAME}`}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="website" className="text-right">Website</Label>
                <Input id="website" name="website" type="url" value={formData.website} onChange={handleInputChange} className="col-span-3" placeholder="https://" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="notes" className="text-right pt-2">Notes</Label>
                <Textarea id="notes" name="notes" value={formData.notes} onChange={handleInputChange} className="col-span-3 min-h-[100px]" disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="jobLink" className="text-right">Job Link</Label>
                <Input id="jobLink" name="jobLink" type="url" value={formData.jobLink} onChange={handleInputChange} className="col-span-3" placeholder="https://" disabled={isSubmitting} />
              </div>
              {error && <p className="col-span-4 text-center text-sm text-red-500 px-6">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetAndCloseForm} disabled={isSubmitting}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (editingId ? "Saving..." : "Adding...") : (editingId ? "Save Changes" : "Add Job")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* --- Delete Confirmation Dialog --- */}
      <Dialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseDeleteDialog();
        }}
        disablePointerDismissal={isDeleting}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the job entry for:
              <br />
              <strong className="break-words">
                {jobs.find((j) => j.id === deletingId)?.company ?? "this job"}
              </strong>
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center py-2">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDeleteDialog} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty state, or the actual table */}
      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-300">
            No jobs tracked yet. Add one above, or once your feeds/scrapes are wired up, they'll show up here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden">
          {/* Horizontal scroll wrapper so the table doesn't break the page layout on smaller screens */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900/40">
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Company</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Industry</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Salary</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Location</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Contact</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap text-center">Applied?</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Website</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Notes</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">Job Link</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, index) => (
                  <motion.tr
                    key={job.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/20"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{job.company}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {job.industry ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {job.salary ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {job.location ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {job.contact ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {job.applied ? (
                        <Check className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 dark:text-gray-600 inline" />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <LinkCell href={job.website} label="Site" />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[220px] truncate" title={job.notes ?? undefined}>
                      {job.notes ?? <span className="text-gray-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <LinkCell href={job.jobLink} label="Posting" />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => handleEditClick(job)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
                          title="Delete"
                          onClick={() => handleOpenDeleteDialog(job.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};
