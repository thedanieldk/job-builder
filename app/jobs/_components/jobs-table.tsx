// app/jobs/_components/jobs-table.tsx
"use client" // Mark as Client Component for state and interaction

// Import Actions and UI Components
import {
  createJob,
  deleteJob,
  getJobs,
  updateJob,
} from "@/actions/jobs-actions"
import {
  approvePendingJob,
  dismissPendingJob,
} from "@/actions/pending-jobs-actions"
import { pollJobsNow } from "@/actions/poll-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { JobCategory, JobStatus } from "@/db/schema/jobs-schema"
import type { PollableCategory } from "@/lib/jsearch-api"
import { AnimatePresence, motion } from "framer-motion"
import {
  Check,
  ChevronDown,
  Edit2,
  ExternalLink,
  Inbox,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState, SubmitEvent } from "react"

// Shape of a single row in the table. Mirrors the "jobs" drizzle schema.
export interface Job {
  id: number
  title: string | null
  company: string
  industry: string | null
  salary: string | null
  location: string | null
  contact: string | null
  applied: boolean
  status: JobStatus
  category: JobCategory
  website: string | null
  notes: string | null
  jobLink: string | null
}

// Shape of a single row in the pending-review queue. Mirrors the
// "pending_jobs" drizzle schema - notice there's no applied/status/contact/
// notes here, since those only make sense once a job is approved into the
// master table.
export interface PendingJob {
  id: number
  title: string | null
  company: string
  industry: string | null
  salary: string | null
  location: string | null
  category: JobCategory
  website: string | null
  jobLink: string | null
  source: string
  externalId: string
}

interface JobsTableProps {
  initialJobs: Job[] // Data passed down from the parent page (fetched via getJobs)
  initialPendingJobs: PendingJob[] // Data passed down from the parent page (fetched via getPendingJobs)
}

// All possible status options, used to populate the <select> in the form
const STATUS_OPTIONS: JobStatus[] = [
  "Not Applied",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Ghosted",
]

// All possible category options - both for the form's <select> and the tabs above the table
const CATEGORY_OPTIONS: JobCategory[] = [
  "Product Manager",
  "GTM Engineering",
  "Other",
]

// Tailwind color classes for each category "pill", same pattern as STATUS_STYLES below
const CATEGORY_STYLES: Record<JobCategory, string> = {
  "Product Manager":
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  "GTM Engineering":
    "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  Other: "bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300",
}

// Tailwind color classes for each status "pill", so it's easy to scan the table at a glance
const STATUS_STYLES: Record<JobStatus, string> = {
  "Not Applied":
    "bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300",
  Applied: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  Interviewing:
    "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  Offer: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  Ghosted:
    "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
}

// Shared styling for the native <select> so it visually matches the shadcn Input component
const SELECT_CLASSNAME =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"

// The editable fields for the create/edit form. Text fields use "" instead of null
// so they work as controlled inputs; we convert "" back to null before saving.
const EMPTY_FORM_DATA = {
  title: "",
  company: "",
  industry: "",
  salary: "",
  location: "",
  contact: "",
  applied: false,
  status: "Not Applied" as JobStatus,
  category: "Other" as JobCategory,
  website: "",
  notes: "",
  jobLink: "",
}

// Small helper to render a link cell (Website / Job Link columns)
// Shows a dash when there's no value, otherwise an icon link that opens in a new tab
const LinkCell = ({ href, label }: { href: string | null; label: string }) => {
  if (!href) {
    return <span className="text-gray-400 dark:text-gray-600">—</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center text-blue-600 hover:underline dark:text-blue-400"
      title={label}
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}

export const JobsTable = ({
  initialJobs,
  initialPendingJobs,
}: JobsTableProps) => {
  // Initialize component state with the data passed down from the server
  const [jobs, setJobs] = useState<Job[]>(initialJobs)

  // --- State for the category tabs above the table ---
  const [activeTab, setActiveTab] = useState<"All" | JobCategory>("All")
  // Only the rows for the active tab get rendered in the table below
  const filteredJobs =
    activeTab === "All" ? jobs : jobs.filter((j) => j.category === activeTab)

  // --- State for the manual "Sync now" buttons ---
  // Holds which category is currently syncing (so we can disable both buttons
  // and label the active one), or null when no sync is in flight
  const [syncingCategory, setSyncingCategory] =
    useState<PollableCategory | null>(null)

  // Runs the JSearch poll for one category right now, then refetches the
  // full job list so any newly-imported or updated rows show up immediately
  const handleSync = async (category: PollableCategory) => {
    setSyncingCategory(category)
    try {
      await pollJobsNow([category])
      const freshJobs = await getJobs()
      setJobs(freshJobs)
    } catch (err) {
      console.error("Sync Jobs Error:", err)
    } finally {
      setSyncingCategory(null)
    }
  }

  // --- State for Create/Edit Form ---
  const [isFormOpen, setIsFormOpen] = useState(false) // Dialog visibility
  const [formData, setFormData] = useState(EMPTY_FORM_DATA) // Form field values
  const [isSubmitting, setIsSubmitting] = useState(false) // Loading state during submission
  const [error, setError] = useState<string | null>(null) // Error message state
  const [editingId, setEditingId] = useState<number | null>(null) // null when creating, number (ID) when editing

  // --- State for Deletion ---
  const [deletingId, setDeletingId] = useState<number | null>(null) // ID of job to delete (drives the confirm dialog)

  // Shared toast for any background action (delete/approve/dismiss) that
  // fails *after* we've already optimistically updated the UI - the dialog
  // or pending row is already gone by the time the error comes back, so
  // this is the only place left to show it.
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Auto-dismiss the toast after a few seconds so it doesn't stick around forever.
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  // --- State for the Pending Review queue ---
  const [pendingJobs, setPendingJobs] =
    useState<PendingJob[]>(initialPendingJobs)
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false)

  // --- Event Handlers ---
  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target
    if (type === "checkbox") {
      // Checkboxes report their value via "checked", not "value"
      const checked = (e.target as HTMLInputElement).checked
      setFormData((prevData) => ({ ...prevData, [name]: checked }))
    } else {
      setFormData((prevData) => ({ ...prevData, [name]: value }))
    }
  }

  // Populate the form with an existing job's data and open the dialog in edit mode
  const handleEditClick = (jobToEdit: Job) => {
    setEditingId(jobToEdit.id) // Store the ID of the job being edited
    setFormData({
      title: jobToEdit.title ?? "",
      company: jobToEdit.company,
      industry: jobToEdit.industry ?? "",
      salary: jobToEdit.salary ?? "",
      location: jobToEdit.location ?? "",
      contact: jobToEdit.contact ?? "",
      applied: jobToEdit.applied,
      status: jobToEdit.status,
      category: jobToEdit.category,
      website: jobToEdit.website ?? "",
      notes: jobToEdit.notes ?? "",
      jobLink: jobToEdit.jobLink ?? "",
    })
    setError(null) // Clear errors
    setIsFormOpen(true) // Open the dialog
  }

  const resetAndCloseForm = () => {
    setIsFormOpen(false) // Close dialog
    setFormData(EMPTY_FORM_DATA) // Reset form fields
    setError(null) // Clear any previous errors
    setIsSubmitting(false) // Reset submitting state
    setEditingId(null) // Reset editingId when closing/resetting
  }

  // Turn the form's "" placeholders back into null for optional fields before saving,
  // so empty cells render as "—" instead of a blank string in the table.
  const buildPayload = () => ({
    title: formData.title.trim() === "" ? null : formData.title,
    company: formData.company,
    industry: formData.industry.trim() === "" ? null : formData.industry,
    salary: formData.salary.trim() === "" ? null : formData.salary,
    location: formData.location.trim() === "" ? null : formData.location,
    contact: formData.contact.trim() === "" ? null : formData.contact,
    applied: formData.applied,
    status: formData.status,
    category: formData.category,
    website: formData.website.trim() === "" ? null : formData.website,
    notes: formData.notes.trim() === "" ? null : formData.notes,
    jobLink: formData.jobLink.trim() === "" ? null : formData.jobLink,
  })

  // Handle form submission for creating or updating a job
  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault() // Prevent standard form submission/page reload
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = buildPayload()
      if (editingId !== null) {
        // --- UPDATE PATH ---
        const updatedJob = await updateJob({ id: editingId, ...payload })
        // Replace the old version of the job with the updated one
        setJobs((prevJobs) =>
          prevJobs.map((j) => (j.id === editingId ? updatedJob : j))
        )
      } else {
        // --- CREATE PATH ---
        const newJob = await createJob(payload)
        // Prepend the new job to the existing array
        setJobs((prevJobs) => [newJob, ...prevJobs])
      }
      resetAndCloseForm() // Close dialog and reset form on success
    } catch (err) {
      console.error("Save Job Error:", err)
      setError(err instanceof Error ? err.message : "Failed to save job.")
      setIsSubmitting(false) // Important: Reset loading state on error
    }
  }

  // --- Inline status change handler ---
  // Lets you change a job's status straight from the table (the colored pill
  // doubles as a <select>) instead of opening the edit dialog. Optimistic
  // like the other single-field actions above: update the pill immediately,
  // then quietly revert + toast if the server call fails.
  const handleStatusChange = (jobId: number, newStatus: JobStatus) => {
    const previousJob = jobs.find((j) => j.id === jobId)
    if (!previousJob || previousJob.status === newStatus) return

    setJobs((prevJobs) =>
      prevJobs.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    )

    updateJob({ id: jobId, status: newStatus }).catch((err) => {
      console.error("Update Job Status Error:", err)
      setJobs((prevJobs) =>
        prevJobs.map((j) =>
          j.id === jobId ? { ...j, status: previousJob.status } : j
        )
      )
      setToastMessage(
        `Failed to update status for "${previousJob.company}". Please try again.`
      )
    })
  }

  // --- Deletion Handlers ---
  const handleOpenDeleteDialog = (id: number) => {
    setDeletingId(id) // Set the ID to trigger the dialog opening
  }

  const handleCloseDeleteDialog = () => {
    setDeletingId(null)
  }

  // Deleting a job is "optimistic": we remove the row and close the dialog
  // immediately, without waiting for the server to respond. This makes the
  // UI feel instant even though the actual delete (and our artificial
  // devDelay) is still happening in the background. If it turns out the
  // delete failed, we quietly put the row back and show a toast explaining
  // why - but the happy path never makes the user wait.
  const handleDeleteConfirm = () => {
    if (deletingId === null) return // Exit if no ID is set

    const idToDelete = deletingId
    // Remember where the job was, so we can put it back in the same spot
    // if the server call ends up failing.
    const indexToRestore = jobs.findIndex((j) => j.id === idToDelete)
    const jobToRestore = jobs[indexToRestore]

    // --- Optimistic update: remove the row and close the dialog now ---
    setJobs((prevJobs) => prevJobs.filter((j) => j.id !== idToDelete))
    setDeletingId(null)

    // --- Actually delete on the server, in the background ---
    deleteJob(idToDelete).catch((err) => {
      console.error("Delete Job Error:", err)
      // Put the job back where it was, since the delete didn't actually happen
      setJobs((prevJobs) => {
        if (prevJobs.some((j) => j.id === idToDelete)) return prevJobs
        const restored = [...prevJobs]
        restored.splice(indexToRestore, 0, jobToRestore)
        return restored
      })
      setToastMessage(
        `Failed to delete "${jobToRestore?.company ?? "job"}". It has been restored.`
      )
    })
  }

  // --- Pending Review Handlers ---
  // Approving is "optimistic" on the pending side: the row disappears from
  // the review queue the instant you click, since that's the interaction
  // that needs to feel instant. It only gets added to the master jobs list
  // once the server confirms the new row (we need the real DB id before it
  // can be edited/deleted like any other job) - with our devDelay that's
  // about a second later, which is fine for a one-at-a-time review flow.
  const handleApprovePending = (pendingId: number) => {
    const indexToRestore = pendingJobs.findIndex((p) => p.id === pendingId)
    const pendingToRestore = pendingJobs[indexToRestore]

    setPendingJobs((prev) => prev.filter((p) => p.id !== pendingId))

    approvePendingJob(pendingId)
      .then((newJob) => {
        setJobs((prev) => [newJob, ...prev])
      })
      .catch((err) => {
        console.error("Approve Pending Job Error:", err)
        // Put it back in the queue, since it never actually got approved
        setPendingJobs((prev) => {
          if (prev.some((p) => p.id === pendingId)) return prev
          const restored = [...prev]
          restored.splice(indexToRestore, 0, pendingToRestore)
          return restored
        })
        setToastMessage(
          `Failed to approve "${pendingToRestore?.company ?? "job"}". Please try again.`
        )
      })
  }

  // Dismissing works just like deleting a job, but against the pending
  // queue instead of the master table - remove it from view immediately,
  // restore it (with a toast) if the background request turns out to fail.
  const handleDismissPending = (pendingId: number) => {
    const indexToRestore = pendingJobs.findIndex((p) => p.id === pendingId)
    const pendingToRestore = pendingJobs[indexToRestore]

    setPendingJobs((prev) => prev.filter((p) => p.id !== pendingId))

    dismissPendingJob(pendingId).catch((err) => {
      console.error("Dismiss Pending Job Error:", err)
      setPendingJobs((prev) => {
        if (prev.some((p) => p.id === pendingId)) return prev
        const restored = [...prev]
        restored.splice(indexToRestore, 0, pendingToRestore)
        return restored
      })
      setToastMessage(
        `Failed to dismiss "${pendingToRestore?.company ?? "job"}". Please try again.`
      )
    })
  }

  return (
    <>
      {/* Category Tabs + Create/Edit Button */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "All" | JobCategory)}
        >
          <TabsList>
            <TabsTrigger value="All">All ({jobs.length})</TabsTrigger>
            {CATEGORY_OPTIONS.map((category) => (
              <TabsTrigger key={category} value={category}>
                {category} ({jobs.filter((j) => j.category === category).length}
                )
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={syncingCategory !== null}
            onClick={() => handleSync("Product Manager")}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncingCategory === "Product Manager" ? "animate-spin" : ""}`}
            />
            {syncingCategory === "Product Manager"
              ? "Syncing..."
              : "Sync Product Manager"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={syncingCategory !== null}
            onClick={() => handleSync("GTM Engineering")}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncingCategory === "GTM Engineering" ? "animate-spin" : ""}`}
            />
            {syncingCategory === "GTM Engineering"
              ? "Syncing..."
              : "Sync GTM Engineering"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setIsPendingModalOpen(true)}
          >
            <Inbox className="h-3.5 w-3.5" />
            Pending Review
            {pendingJobs.length > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                {pendingJobs.length}
              </span>
            )}
          </Button>
          <Dialog
            open={isFormOpen}
            onOpenChange={(open) => {
              if (!open) resetAndCloseForm()
              else setIsFormOpen(open)
            }}
            disablePointerDismissal={isSubmitting}
          >
            <DialogTrigger
              render={
                <Button
                  onClick={() => {
                    setEditingId(null) // Ensure create mode
                    resetAndCloseForm()
                    // Default the new job's category to whichever tab is
                    // currently active, so it shows up immediately instead
                    // of silently landing in a different (filtered-out) tab
                    if (activeTab !== "All") {
                      setFormData((prev) => ({ ...prev, category: activeTab }))
                    }
                    setIsFormOpen(true)
                  }}
                  className="gap-2"
                />
              }
            >
              <Plus className="h-5 w-5" /> Add Job
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] md:max-w-[650px]">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Job" : "Add New Job"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Make changes to this job."
                    : "Enter the details for the job you're tracking."}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={handleSubmit}
                className="grid max-h-[70vh] gap-4 overflow-y-auto py-4 pr-1"
              >
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">
                    Title
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="col-span-3"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="company" className="text-right">
                    Company
                  </Label>
                  <Input
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    required
                    className="col-span-3"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="industry" className="text-right">
                    Industry
                  </Label>
                  <Input
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleInputChange}
                    className="col-span-3"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="salary" className="text-right">
                    Salary
                  </Label>
                  <Input
                    id="salary"
                    name="salary"
                    value={formData.salary}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="e.g. $100k - $120k"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="location" className="text-right">
                    Location
                  </Label>
                  <Input
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="col-span-3"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="contact" className="text-right">
                    Contact
                  </Label>
                  <Input
                    id="contact"
                    name="contact"
                    value={formData.contact}
                    onChange={handleInputChange}
                    className="col-span-3"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="applied" className="text-right">
                    Applied?
                  </Label>
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
                  <Label htmlFor="status" className="text-right">
                    Status
                  </Label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    className={`col-span-3 ${SELECT_CLASSNAME}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="category" className="text-right">
                    Category
                  </Label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    className={`col-span-3 ${SELECT_CLASSNAME}`}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="website" className="text-right">
                    Website
                  </Label>
                  <Input
                    id="website"
                    name="website"
                    type="url"
                    value={formData.website}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="https://"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="notes" className="pt-2 text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="col-span-3 min-h-[100px]"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="jobLink" className="text-right">
                    Job Link
                  </Label>
                  <Input
                    id="jobLink"
                    name="jobLink"
                    type="url"
                    value={formData.jobLink}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="https://"
                    disabled={isSubmitting}
                  />
                </div>
                {error && (
                  <p className="col-span-4 px-6 text-center text-sm text-red-500">
                    {error}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetAndCloseForm}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? editingId
                        ? "Saving..."
                        : "Adding..."
                      : editingId
                        ? "Save Changes"
                        : "Add Job"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* --- Delete Confirmation Dialog --- */}
      <Dialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseDeleteDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the job
              entry for:
              <br />
              <strong className="break-words">
                {jobs.find((j) => j.id === deletingId)?.company ?? "this job"}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDeleteDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Pending Review Modal --- */}
      {/* Jobs the poller found but you haven't reviewed yet. Nothing here is
          in the master table - approving inserts it there, dismissing just
          removes it from this list. Both actions are optimistic (see the
          handlers above), so each row disappears the instant you click. */}
      <Dialog open={isPendingModalOpen} onOpenChange={setIsPendingModalOpen}>
        <DialogContent className="sm:max-w-[700px] md:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Pending Review ({pendingJobs.length})</DialogTitle>
            <DialogDescription>
              Approve the jobs you want to add to your tracked list, or dismiss
              the ones that aren&apos;t relevant.
            </DialogDescription>
          </DialogHeader>
          {pendingJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No pending jobs right now. Run a sync to check for new listings.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700/50">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-gray-200 bg-gray-50 dark:border-gray-700/50 dark:bg-gray-900">
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Title
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Company
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Salary
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Location
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Category
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Link
                    </th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {pendingJobs.map((pendingJob) => (
                      <motion.tr
                        key={pendingJob.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/20"
                      >
                        <td
                          className="max-w-[160px] truncate px-3 py-2.5 font-medium text-gray-900 dark:text-white"
                          title={pendingJob.title ?? undefined}
                        >
                          {pendingJob.title ?? (
                            <span className="text-gray-400 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-2.5 font-medium text-gray-900 dark:text-white"
                          title={pendingJob.company}
                        >
                          {pendingJob.company}
                        </td>
                        <td
                          className="max-w-[120px] truncate px-3 py-2.5 text-gray-600 dark:text-gray-300"
                          title={pendingJob.salary ?? undefined}
                        >
                          {pendingJob.salary ?? (
                            <span className="text-gray-400 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                        <td
                          className="max-w-[130px] truncate px-3 py-2.5 text-gray-600 dark:text-gray-300"
                          title={pendingJob.location ?? undefined}
                        >
                          {pendingJob.location ?? (
                            <span className="text-gray-400 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[pendingJob.category]}`}
                          >
                            {pendingJob.category}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <LinkCell href={pendingJob.jobLink} label="Posting" />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-500"
                              title="Approve - add to your tracked jobs"
                              onClick={() =>
                                handleApprovePending(pendingJob.id)
                              }
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400"
                              title="Dismiss - not relevant"
                              onClick={() =>
                                handleDismissPending(pendingJob.id)
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- Background-action-failed toast --- */}
      {/* Only ever shows up if a delete/approve/dismiss request fails after
          we've already optimistically updated the UI - see the handlers above. */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-gray-800 dark:text-red-400"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state, or the actual table (filtered to the active category tab) */}
      {filteredJobs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-600 dark:text-gray-300">
            {jobs.length === 0
              ? "No jobs tracked yet. Add one above, or once your feeds/scrapes are wired up, they'll show up here."
              : "No jobs in this category yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700/50 dark:bg-gray-800/50">
          {/* Horizontal scroll wrapper so the table doesn't break the page layout on smaller screens */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700/50 dark:bg-gray-900/40">
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Title
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Company
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Industry
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Salary
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Location
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Contact
                  </th>
                  <th className="px-2.5 py-2 text-center font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Applied?
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Status
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Category
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Website
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Notes
                  </th>
                  <th className="px-2.5 py-2 font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Job Link
                  </th>
                  <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap text-gray-700 dark:text-gray-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filteredJobs.map((job) => (
                    <motion.tr
                      key={job.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/20"
                    >
                      <td
                        className="max-w-[160px] truncate px-2.5 py-2.5 font-medium text-gray-900 dark:text-white"
                        title={job.title ?? undefined}
                      >
                        {job.title ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-[140px] truncate px-2.5 py-2.5 font-medium text-gray-900 dark:text-white"
                        title={job.company}
                      >
                        {job.company}
                      </td>
                      <td
                        className="max-w-[120px] truncate px-2.5 py-2.5 text-gray-600 dark:text-gray-300"
                        title={job.industry ?? undefined}
                      >
                        {job.industry ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-[110px] truncate px-2.5 py-2.5 text-gray-600 dark:text-gray-300"
                        title={job.salary ?? undefined}
                      >
                        {job.salary ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-[120px] truncate px-2.5 py-2.5 text-gray-600 dark:text-gray-300"
                        title={job.location ?? undefined}
                      >
                        {job.location ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-[140px] truncate px-2.5 py-2.5 text-gray-600 dark:text-gray-300"
                        title={job.contact ?? undefined}
                      >
                        {job.contact ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-center">
                        {job.applied ? (
                          <Check className="inline h-4 w-4 text-green-500" />
                        ) : (
                          <X className="inline h-4 w-4 text-gray-300 dark:text-gray-600" />
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        {/* Looks like the status pill, but is a real <select> -
                            click it to change the status right from the table,
                            no need to open the edit dialog. */}
                        <div className="relative inline-block">
                          <select
                            value={job.status}
                            onChange={(e) =>
                              handleStatusChange(
                                job.id,
                                e.target.value as JobStatus
                              )
                            }
                            className={`cursor-pointer appearance-none rounded-full py-0.5 pr-6 pl-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${STATUS_STYLES[job.status]}`}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 opacity-60" />
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[job.category]}`}
                        >
                          {job.category}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <LinkCell href={job.website} label="Site" />
                      </td>
                      <td
                        className="max-w-[220px] truncate px-2.5 py-2.5 text-gray-600 dark:text-gray-300"
                        title={job.notes ?? undefined}
                      >
                        {job.notes ?? (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <LinkCell href={job.jobLink} label="Posting" />
                      </td>
                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Edit"
                            onClick={() => handleEditClick(job)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
                            title="Delete"
                            onClick={() => handleOpenDeleteDialog(job.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
