import { SakaiElement } from "/webcomponents/sakai-element.js";
import { html } from "/webcomponents/assets/lit-element/lit-element.js";
import { unsafeHTML } from "/webcomponents/assets/lit-html/directives/unsafe-html.js";
import { ifDefined } from "/webcomponents/assets/lit-html/directives/if-defined.js";
import "/webcomponents/fa-icon.js";
import "./sakai-grader-file-picker.js";
import "../sakai-date-picker.js";
import "../sakai-group-picker.js";
import "../sakai-document-viewer.js";
import "../sakai-lti-iframe.js";
import "../sakai-user-photo.js";
import { gradableDataMixin } from "./sakai-gradable-data-mixin.js";
import { Submission } from "./submission.js";
import "/webcomponents/rubrics/rubric-association-requirements.js";
import "/webcomponents/rubrics/sakai-rubric-grading-button.js";

import { GRADE_CHECKED,
          LETTER_GRADE_TYPE,
          SCORE_GRADE_TYPE,
          PASS_FAIL_GRADE_TYPE,
          CHECK_GRADE_TYPE } from "./sakai-grader-constants.js";

export class SakaiGrader extends gradableDataMixin(SakaiElement) {

  constructor() {

    super();

    this.sumittedTextMode = false;
    this.rubricParams = new Map();
    this.graderOnLeft = this.getSetting("grader", "graderOnLeft");
    this.saveSucceeded = false;
    this.saveFailed = false;
    this.submissions = [];
    this.ungradedOnly = false;
    this.submittedOnly = false;
    this.hasUngraded = false;
    this.hasUnsubmitted = false;
    this.resubmitNumber = "1";
    this.confirmedNotSavePvtNotes = false;
    this.confirmedNotSaveFeedback = false;
    this.savedPvtNotes = true;
    this.savedFeedbackComment = true;

    this.assignmentsI18n = {};

    this.i18nPromise = this.loadTranslations("grader");
    this.i18nPromise.then(t => this.i18n = t);

    this.loadTranslations("assignment").then(t => this.assignmentsI18n = t);
    if (typeof MathJax !== "undefined") {
      MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    }

    this.canSave = true;
  }

  static get properties() {

    return {
      // Actual attributes
      gradableId: { attribute: "gradable-id", type: String },
      submissionId: { attribute: "submission-id", type: String },
      currentStudentId: { attribute: "current-student-id", type: String },
      gradableTitle: { attribute: "gradable-title", type: String },
      hasAssociatedRubric: { attribute: "has-associated-rubric", type: String },
      entityId: { attribute: "entity-id", type: String },
      toolId: { attribute: "tool-id", type: String },
      userListUrl: { attribute: "user-list-url", type: String },
      enablePdfExport: { attribute: "enable-pdf-export", type: Boolean },
      // State vars we want to trigger a render
      submittedTextMode: { attribute: false, type: Boolean },
      submission: { attribute: false, type: Object },
      nonEditedSubmission: { attribute: false, type: Object },
      graderOnLeft: { attribute: false, type: Boolean },
      selectedAttachment: { attribute: false, type: Object },
      saveSucceeded: { attribute: false, type: Boolean },
      saveFailed: { attribute: false, type: Boolean },
      savedPvtNotes: { attribute: false, type: Boolean },
      savedFeedbackComment: { attribute: false, type: Boolean },
      submissions: { attribute: false, type: Array },
      ungradedOnly: { attribute: false, type: Boolean },
      submissionsOnly: { attribute: false, type: Boolean },
      showResubmission: { attribute: false, type: Boolean },
      isChecked: { attribute: false, type: Boolean },
      allowExtension: { attribute: false, type: Boolean },
      totalGraded: { attribute: false, type: Number },
      token: { attribute: false, type: String },
      rubric: { attribute: false, type: Object },
      assignmentsI18n: { attribute: false, type: Object },
      showingHistory: { attribute: false, type: Boolean },
      ltiGradebleLaunch: { attribute: "lti-gradable-launch", type: String },
      showOverrides: { attribute: false, type: Boolean },
      canSave: { attribute: false, type: Boolean },
    };
  }

  set gradableId(newValue) {

    this._gradableId = newValue;
    this.i18nPromise.then(() => this.loadData(newValue));
  }

  get gradableId() {
    return this._gradableId;
  }

  set submission(newValue) {

    if (!this.nonEditedSubmission || newValue.id !== this.nonEditedSubmission.id) {
      this.nonEditedSubmission = {};
      Object.assign(this.nonEditedSubmission, newValue);
    }
    this._submission = newValue;
    this.saveSucceeded = false;
    this.saveFailed = false;
    this.modified = false;
    this.rubricParams = new Map();
    this.showResubmission = this._submission.resubmitsAllowed === -1 || this._submission.resubmitsAllowed > 0;
    this.isChecked = newValue.grade === this.assignmentsI18n["gen.checked"] || newValue.grade === GRADE_CHECKED;
    this.allowExtension = this._submission.extensionAllowed;
    this.submittedTextMode = this._submission.submittedText;

    // If there's no submitted text and at least one attachment, show the first attachment
    // by default.
    if (!this.submittedTextMode && this._submission.submittedAttachments
          && this._submission.submittedAttachments.length > 0) {
      this.selectedAttachment = this._submission.submittedAttachments[0];
      const preview = this.submission.previewableAttachments[this.selectedAttachment.ref];
      this.selectedPreview = preview || this.selectedAttachment;
    }

    if (this.feedbackCommentEditor) {
      this.feedbackCommentEditor.setData(this._submission.feedbackComment, () => this.modified = false);
    }

    if (this.privateNotesEditor) {
      this.privateNotesEditor.setData(this._submission.privateNotes, () => this.modified = false);
    }

    this.querySelector("sakai-rubric-grading")?.setAttribute("evaluated-item-id", this._submission.id);

    this.requestUpdate();

    if (this.gradable.allowPeerAssessment) {
      this.updateComplete.then(() => $("#peer-info").popover());
    }

    // If any grade overrides have been set, check the overrides box
    this.showOverrides = this.submission.submitters?.some(s => s.overridden);
  }

  get submission() {
    return this._submission;
  }

  shouldUpdate() {
    return this.i18n && this.submission;
  }

  renderNav() {

    return html`
      <div class="left-block">
        <div class="assessment-info">
          <div class="course-title">${unsafeHTML(portal.siteTitle)}</div>
          <div class="assessment-title">${this.gradableTitle}</div>
        </div>
        <div id="grader-settings-wrapper">
          <a id="settings-link" href="javascript;" @click=${this.toggleSettings} title="${this.i18n.settings}">
            <fa-icon size="1.3em" i-class="fas cogs" path-prefix="/webcomponents/assets" />
          </a>
          <div id="grader-settings" @keydown=${this.onSettingsKeydown} class="settings">
            <div><label><input type="checkbox" ?disabled=${!this.hasUnsubmitted} @change=${this.submittedOnlyChanged} .checked=${this.submittedOnly} />${this.assignmentsI18n["nav.view.subsOnly"]}</label></div>
            <div><label><input type="checkbox" ?disabled=${!this.hasUngraded} @change=${this.ungradedOnlyChanged} .checked=${this.ungradedOnly} />${this.i18n.only_ungraded}</label></div>
            <div><label><input type="checkbox" @change=${this.graderOnLeftChanged} .checked=${this.graderOnLeft} />${this.i18n.grader_on_left}</label></div>
            ${this.isGroupGradable ? "" : html`
              <div class="grader-groups">
                <span>${this.assignmentsI18n.please_select_group}</span>
                <sakai-group-picker groups="${JSON.stringify(this.groups)}" @group-selected=${this.groupSelected}></sakai-group-picker>
              </div>
            `}
          </div>
        </div>
      </div>
      <div class="total-block">
        <div>
          <div class="total-label">${this.assignmentsI18n.grad3}</div>
          <div class="total-graded">${this.totalGraded} / ${this.submissions.length}</div>
        </div>
      </div>
      <div class="grader-navigator">
        <div>
          <button class="btn-transparent"
              title="${this.assignmentsI18n["nav.list"]}"
              @click=${this.toStudentList}
              ?disabled=${!this.canSave}>
            ${this.assignmentsI18n["nav.list"]}
          </button>
        </div>
        <div>
          <button class="btn-transparent" @click=${this.previous} aria-label="${this.i18n.previous_submission_label}" ?disabled=${!this.canSave}>
            <fa-icon size="2em" i-class="fas arrow-circle-left" path-prefix="/webcomponents/assets" style="vertical-align: middle;" />
          </button>
          <select aria-label="${this.i18n.student_selector_label}" @change=${this.studentSelected} ?disabled=${!this.canSave}>
            ${this.submissions.map(s => html`<option value="${s.id}" .selected=${this.submission.id === s.id}>${s.groupId ? s.groupTitle : s.firstSubmitterName}</option>`)}
          </select>
          <button class="btn-transparent" @click=${this.next} aria-label="${this.i18n.next_submission_label}" ?disabled=${!this.canSave}>
            <fa-icon size="2em" i-class="fas arrow-circle-right" path-prefix="/webcomponents/assets" style="vertical-align: middle;" />
          </button>
        </div>
        <div>${this.currentStudentInfo}</div>
      </div>
    `;
  }

  renderGradable() {

    return html`
      <div class="gradable">
        ${this.submission.ltiSubmissionLaunch ? html`
          <div class="sak-banner-info">${unsafeHTML(this.i18n.lti_grade_launch_instructions)}</div>
          <sakai-lti-iframe
            allow-resize="yes"
            new-window-text="${this.i18n.lti_grade_launch_button}"
            launch-url="${this.submission.ltiSubmissionLaunch}"
         />
        ` : "" }
        ${(this.ltiGradableLaunch && ! this.submission.ltiSubmissionLaunch )  ? html`
          <div class="sak-banner-info">${unsafeHTML(this.i18n.lti_grade_launch_instructions)}</div>
          <sakai-lti-iframe
            allow-resize="yes"
            new-window-text="${this.i18n.lti_grade_launch_button}"
            launch-url="${this.ltiGradableLaunch}"
         />
        ` : "" }
        ${this.submission.submittedTime || (this.submission.draft && this.submission.visible) ? html`
          ${this.submittedTextMode ? html`
            <h3>${this.assignmentsI18n["gen.subm"]}</h3>
            <div class="sak-banner-info">${unsafeHTML(this.i18n.inline_feedback_instruction)}</div>
            <textarea id="grader-feedback-text-editor" style="display: none">${this.submission.feedbackText}</textarea>
            <div id="grader-feedback-text">${unsafeHTML(this.submission.feedbackText)}</div>
            <button id="edit-inline-feedback-button" class="inline-feedback-button" @click=${this.toggleInlineFeedback} aria-haspopup="true">${this.assignmentsI18n.addfeedback}</button>
            <button id="show-inline-feedback-button" class="inline-feedback-button" @click=${this.toggleInlineFeedback} aria-haspopup="true" style="display: none;">${this.assignmentsI18n["gen.don"]}</button>
          ` : html`
            ${this.selectedAttachment || this.selectedPreview ? html`
              <div class="preview">
                <sakai-document-viewer
                    preview="${ifDefined(this.selectedPreview ? JSON.stringify(this.selectedPreview) : undefined)}"
                    content="${ifDefined(this.selectedAttachment ? JSON.stringify(this.selectedAttachment) : undefined)}">
                </sakai-document-viewer>
              </div>
            ` : ""}
          `}
        ` : ""}
      </div>
    `;
  }

  renderSaved() {

    return html`<span class="saved fa fa-check-circle"
                  title="${this.i18n.saved_successfully}"
                  style="display: ${this.saveSucceeded ? "inline" : "none"};">
                </span>`;
  }

  renderFailed() {

    return html`<span class="saved failed fa fa-times-circle"
                  title="${this.i18n.failed_save}"
                  style="display: ${this.saveFailed ? "inline" : "none"};">
                </span>`;
  }

  _renderGradeInputs(label, submitter) {

    return html`
      <span>${label}</span>
      ${this.gradeScale === LETTER_GRADE_TYPE ? html`
        <select id="letter-grade-selector"
            aria-label="${this.i18n.lettergrade_selector_label}"
            class=${ifDefined(submitter ? "grader-grade-override" : undefined)}
            data-user-id="${ifDefined(submitter ? submitter.id : undefined)}"
            @change=${submitter ? undefined : this.gradeSelected}>
          <option value="">${this.assignmentsI18n["non.submission.grade.select"]}</option>
          ${this.letterGradeOptions.map(grade => html`
          <option value="${grade}"
              .selected=${submitter ? submitter.overridden && submitter.grade === grade : this.submission.grade === grade}>
            ${grade}
          </option>
          `)}
        </select>
        ${this.renderSaved()}
        ${this.renderFailed()}
      ` : ""}
      ${this.gradeScale === SCORE_GRADE_TYPE ? html`
        <input id="score-grade-input" aria-label="${this.i18n.number_grade_label}"
          @keydown=${this.validateGradeInput}
          @keyup=${submitter ? undefined : this.gradeSelected}
          data-user-id="${ifDefined(submitter ? submitter.id : undefined)}"
          type="text"
          class="points-input ${ifDefined(submitter ? "grader-grade-override" : undefined)}"
          .value=${submitter ? (submitter.overridden ? submitter.grade : "") : this.submission.grade} />
        ${this.renderSaved()}
        ${this.renderFailed()}
        <span>(${this.assignmentsI18n["grade.max"]} ${this.gradable.maxGradePoint})</span>
        ${this.gradable.allowPeerAssessment ? html`
          <a id="peer-info" class="fa fa-info-circle" data-bs-toggle="popover" data-container="body" data-placement="auto" data-content="${this.assignmentsI18n["peerassessment.peerGradeInfo"]}"></a>
        ` : ""}
      ` : ""}
      ${this.gradeScale === PASS_FAIL_GRADE_TYPE ? html`
        <select id="pass-fail-selector"
                  aria-label="${this.i18n.passfail_selector_label}"
                  class=${ifDefined(submitter ? "grader-grade-override" : undefined)}
                  data-user-id="${ifDefined(submitter ? submitter.id : undefined)}"
                  @change=${submitter ? undefined : this.gradeSelected}
                  .value=${submitter ? submitter.grade : this.submission.grade}>
          <option value="ungraded"
              .selected=${submitter ? !submitter.overridden : this.submission.grade === this.assignmentsI18n.ungra}>
            ${this.assignmentsI18n.ungra}
          </option>
          <option value="pass"
              .selected=${submitter ? submitter.overridden && submitter.grade === this.assignmentsI18n.pass : this.submission.grade.match(/^pass$/i)}>
            ${this.assignmentsI18n.pass}
          </option>
          <option value="fail"
              .selected=${submitter ? submitter.overridden && submitter.grade === this.assignmentsI18n.fail : this.submission.grade.match(/^fail$/i)}>
            ${this.assignmentsI18n.fail}
          </option>
        </select>
        ${this.renderSaved()}
        ${this.renderFailed()}
      ` : ""}
      ${this.gradeScale === CHECK_GRADE_TYPE ? html`
        <input id="check-grade-input"
                type="checkbox"
                data-user-id="${ifDefined(submitter ? submitter.id : undefined)}"
                aria-label="${this.i18n.checkgrade_label}"
                class=${ifDefined(submitter ? "grader-grade-override" : undefined)}
                @click=${submitter ? undefined : this.gradeSelected}
                value=${GRADE_CHECKED}
                .checked=${submitter ? (submitter.overridden && submitter.grade === this.assignmentsI18n["gen.checked"]) : this.submission.grade === this.assignmentsI18n["gen.checked"]}>
        </input>
        <span>${this.assignmentsI18n["gen.gra2"]} ${this.assignmentsI18n["gen.checked"]}</span>
        ${this.renderSaved()}
        ${this.renderFailed()}
      ` : ""}
    `;
  }

  renderGrader() {

    // Hide the right UI until we have push notifications for grade changes
    if (this.submission.ltiSubmissionLaunch) return "";

    return html`
      ${this.submission.id !== "dummy" ? html`
      <div class="grader ${this.graderOnLeft ? "on-left" : ""}">
        <div id="grader-submitted-block" class="grader-block">
          <div style="display: flex;">
            <sakai-user-photo user-id="${this._getPhotoUserId()}" classes="grader-photo" profile-popup="on"></sakai-user-photo>
            <div class="submitted-time" style="flex: 4;">
              ${this.submission.submittedTime || (this.submission.draft && this.submission.visible) ? html`
                <span class="submitter-name">${this.renderSubmitter()}</span>
                ${this.submission.draft && this.submission.visible ? html`
                <span class="draft-submission">(${this.i18n.draft_submission})</span>
                ` : ""}
                <div class="submitted-time ${this.submission.draft ? "draft-time" : ""}">${this.submission.submittedTime}</div>
                ${this.submission.late ? html`<span class="grader-late">${this.assignmentsI18n["grades.lateness.late"]}</span>` : ""}
                ${this.submission.returned ? this.renderGraderReturned() : ""}
              ` : html`
                <span>${this.i18n.no_submission_for} ${this.renderSubmitter()}</span>
                ${this.submission.returned ? this.renderGraderReturned() : ""}
              `}
            </div>
          </div>
          ${this.submission.groupId && this.submission.submittedTime ? html`<div class="grader-group-members">${this.submission.groupMembers}</div>` : ""}
          <div class="attachments">
            ${this.submission.submittedAttachments.length > 0 ? html`
              <div class="attachments-header">${this.assignmentsI18n["gen.stuatt"]}:</div>
              ${this.submission.submittedAttachments.map(r => html`
                <div class="attachment-link"><a href="javascript;" data-url="${r.url}" @click=${this.previewAttachment}>${r.name}</a></div>
              `)}` : ""}
          </div>
          <div class="timeSpent-block">
            ${this.submission.submitters[0].timeSpent ? html`
              <span>${this.assignmentsI18n["gen.assign.spent"]}</span>
              <span> ${this.submission.submitters[0].timeSpent}</span>
            ` : ""}
          </div>
        </div> <!-- /grader-submitted-block -->

        ${this.submission.originalityShowing ? html`
          <div>
            <label class="grader-label grader-originality-label">
              <span>${this.submission.originalityServiceName}</span>
              <span>${this.assignmentsI18n["review.report"]}</span>
            </label>
            ${this.submission.originalitySupplies.map(result => html`
              <div class="grader-originality-section" >
                ${result[Submission.originalityConstants.originalityLink] !== 'Error' ? html`
                  <a target="_blank"
                      href="${result[Submission.originalityConstants.originalityLink]}"
                      class="grader-originality-link">
                    <i class="${result[Submission.originalityConstants.originalityIcon]}"></i>
                    <span>${result[Submission.originalityConstants.originalityScore]}${this.assignmentsI18n["content_review.score_display.grader"]}</span>
                  </a>
                  <span>
                    <span class="grader-originality-delimiter">${this.assignmentsI18n["content_review.delimiter"]}</span>
                    <span>${result[Submission.originalityConstants.originalityName]}</span>
                  </span>
                ` : html`
                  ${result[Submission.originalityConstants.originalityStatus] === 'true' ? html`
                    <a href="#${result[Submission.originalityConstants.originalityKey]}"
                        class="grader-originality-link"
                        data-bs-toggle="collapse"
                        role="button"
                        aria-expanded="false"
                        aria-controls="${result[Submission.originalityConstants.originalityKey]}">
                      <i class="${result[Submission.originalityConstants.originalityIcon]}"></i>
                      <span>${this.assignmentsI18n["content_review.disclosure.pending"]}</span>
                    </a>
                  ` : html`
                    <a href="#${result[Submission.originalityConstants.originalityKey]}"
                        class="grader-originality-link"
                        data-bs-toggle="collapse"
                        role="button"
                        aria-expanded="false"
                        aria-controls="${result[Submission.originalityConstants.originalityKey]}">
                      <i class="${result[Submission.originalityConstants.originalityIcon]}"></i>
                      <span>${this.assignmentsI18n["content_review.disclosure.error"]}</span>
                    </a>
                  `}
                  <span>
                    <span class="grader-originality-delimiter">${this.assignmentsI18n["content_review.delimiter"]}</span>
                    <span>${result[Submission.originalityConstants.originalityName]}</span>
                  </span>
                  <div class="collapse grader-originality-caption" id="${result[Submission.originalityConstants.originalityKey]}">
                    <div>${result[Submission.originalityConstants.originalityError]}</div>
                  </div>
                `}
                <br />
              </div>
            `)}
          </div>
        ` : ""}
        ${this.submission.originalityShowing ? html`
          <div>
            <label class="grader-label grader-originality-label"><span>${this.submission.originalityServiceName}</span><span>${this.assignmentsI18n["review.report"]}</span></label>
            ${this.submission.originalitySupplies.map(result => html`
              <div class="grader-originality-section" >
                ${result[Submission.originalityConstants.originalityLink] !== 'Error' ? html`
                  <a target="_blank"
                      href="${result[Submission.originalityConstants.originalityLink]}"
                      class="grader-originality-link">
                    <i class="${result[Submission.originalityConstants.originalityIcon]}"></i>
                    <span>${result[Submission.originalityConstants.originalityScore]}${this.assignmentsI18n["content_review.score_display.grader"]}</span>
                  </a>
                  <span>
                    <span class="grader-originality-delimiter">${this.assignmentsI18n["content_review.delimiter"]}</span>
                    <span>${result[Submission.originalityConstants.originalityName]}</span>
                  </span>
                ` : html`
                  ${result[Submission.originalityConstants.originalityStatus] === 'true' ? html`
                    <a href="#${result[Submission.originalityConstants.originalityKey]}"
                        data-bs-toggle="collapse"
                        role="button"
                        aria-expanded="false"
                        aria-controls="${result[Submission.originalityConstants.originalityKey]}"
                        class="grader-originality-link">
                      <i class="${result[Submission.originalityConstants.originalityIcon]}"></i>
                      <span>${this.assignmentsI18n["content_review.disclosure.pending"]}</span>
                    </a>
                    <span>
                      <span class="grader-originality-delimiter">${this.assignmentsI18n["content_review.delimiter"]}</span>
                      <span>${result[Submission.originalityConstants.originalityName]}</span>
                    </span>
                    <div class="collapse grader-originality-caption" id="${result[Submission.originalityConstants.originalityKey]}">
                      <div>
                        <span>${this.assignmentsI18n["content_review.notYetSubmitted.grader"]}</span>
                        <span>${this.submission.originalityServiceName}</span>
                      </div>
                    </div>
                  ` : html`
                    <a href="#${result[Submission.originalityConstants.originalityKey]}"
                        data-bs-toggle="collapse"
                        role="button"
                        aria-expanded="false"
                        aria-controls="${result[Submission.originalityConstants.originalityKey]}"
                        class="grader-originality-link">
                      <i class="${result[Submission.originalityConstants.originalityIcon]}"></i><span>${this.assignmentsI18n["content_review.disclosure.error"]}</span>
                    </a>
                    <span>
                      <span class="grader-originality-delimiter">${this.assignmentsI18n["content_review.delimiter"]}</span>
                      <span>${result[Submission.originalityConstants.originalityName]}</span>
                    </span>
                    <div class="collapse grader-originality-caption" id="${result[Submission.originalityConstants.originalityKey]}">
                      <div>${result[Submission.originalityConstants.originalityError]}</div>
                    </div>
                  `}
                `}
                <br />
              </div>
            `)}
          </div>
        ` : ""}
        <div id="grader-grade-block" class="grader-block">
          ${this._renderGradeInputs(this.assignmentsI18n["gen.assign.gra"])}
          <!-- start hasAssociatedRubric -->
          ${this.hasAssociatedRubric === "true" ? html`
            <sakai-rubric-grading-button
              id="grader-rubric-link"
              title="${this.assignmentsI18n.grading_rubric}"
              site-id="${portal.siteId}"
              tool-id="${this.toolId}"
              entity-id="${this.entityId}"
              evaluated-item-id="${this.submission.id}"
              evaluated-item-owner-id="${this.submission.firstSubmitterId}"
              @click=${this.toggleRubric}>
            </sakai-rubric-grading-button>
            <div id="rubric-panel" title="${this.i18n.rubric}" style="display: none;">
              <sakai-rubric-grading
                site-id="${portal.siteId}"
                tool-id="${this.toolId}"
                entity-id="${this.entityId}"
                evaluated-item-id="${this.submission.id}"
                evaluated-item-owner-id="${this.submission.groupRef || this.submission.firstSubmitterId}"
                ?group=${this.submission.groupId}
                ?enable-pdf-export=${this.enablePdfExport}
                @total-points-updated=${this.onTotalPointsUpdated}
                @rubric-rating-changed=${this.onRubricRatingChanged}
                @rubric-ratings-changed=${this.onRubricRatingsChanged}
                @rubric-rating-tuned=${this.onRubricRatingTuned}
                @update-comment=${this.onUpdateCriterionComment}
              ></sakai-rubric-grading>
              <button @click=${this.doneWithRubricDialog}>${this.assignmentsI18n["gen.don"]}</button>
            </div>
          ` : ""}
          <!-- end hasAssociatedRubric -->

          ${this.submission.groupId ? html`
            <div id="grader-overrides-wrapper">
              <label>
                <input type="checkbox" id="grader-override-toggle" ?checked=${this.showOverrides} @click=${e => this.showOverrides = e.target.checked} />
                <span class="grader-overrides-label">${this.i18n.assign_grade_overrides}</span>
              </label>
              <div id="grader-overrides-block" style="${this.showOverrides ? "display: block" : "display: none"}">
              ${this.submission.submitters.map(s => html`
                <div class="grader-override">
                  <div class="grader-overrides-display-name">${s.displayName} (${s.displayId})</div>
                  <div>${this._renderGradeInputs(this.i18n.override_grade_with, s)}</div>
                </div>
              `)}
              </div>
            </div>
          ` : "" }
        </div>
        <div class="feedback-label grader-label content-button-block grader-block">
          <button id="grader-feedback-button" @click=${this.toggleFeedback} aria-haspopup="true" title="${this.i18n.add_feedback_tooltip}" >${this.assignmentsI18n.feedbackcomment}</button>
          ${this.submission.feedbackComment ? html`<div class="active-indicator ${this.savedFeedbackComment ? "" : "unsaved"}" aria-label="${this.feedbackCommentPresentMsg()}" title="${this.feedbackCommentPresentMsg()}"></div>` : ""}
        </div>
        <div id="feedback-panel" class="grader-panel" title="${this.assignmentsI18n.feedbackcomment}" style="display: none;">
          <div class="feedback-title">${this.assignmentsI18n["gen.instrcomment"]}</div>
          <div class="feedback-instruction sak-banner-info">${this.i18n.feedback_instruction}</div>
          <div id="feedback-comment-unsaved-msg" class="feedback-instruction sak-banner-error hidden">${this.i18n.unsaved_text_warning}</div>
          <textarea id="grader-feedback-comment" .value=${this.submission.feedbackComment}></textarea>
          <div class="media-feedback grader-label">
            <span class="feedback-label">${this.i18n.recorded_feedback_label}</span>
            <fa-icon size="1.5em" i-class="fas microphone" path-prefix="/webcomponents/assets" style="vertical-align: middle;"></fa-icon>
            <fa-icon size="1.5em" i-class="fas video" path-prefix="/webcomponents/assets" style="vertical-align: middle;"></fa-icon>
          </div>
          <button @click=${this.doneWithFeedbackDialog}>${this.assignmentsI18n["gen.don"]}</button>
          <button @click=${this.cancelFeedbackToggle}>${this.assignmentsI18n["gen.can"]}</button>
        </div>

        <div id="grader-feedback-attachments-block" class="grader-block grader-label">
          ${this.submission.feedbackAttachments ? html`
            <div class="feedback-attachments-title">${this.assignmentsI18n["download.feedback.attachment"]}</div>
            <div class="current-feedback-attachments">
              ${this.submission.feedbackAttachments.map(att => html`
                <div class="feedback-attachments-row">
                  <div class="feedback-attachment">
                    <a href="/access${att.ref}" title="${this.i18n.feedback_attachment_tooltip}">
                      <span>${att.name}</span>
                    </a>
                  </div>
                  <div class="feedback-attachment-remove">
                    <a data-ref="${att.ref}"
                        @click=${this.removeAttachment}
                        href="javascript:;">
                      ${this.assignmentsI18n["gen.remove"]}
                    </a>
                  </div>
                </div>
              `)}
            </div>`
          : ""}
          <sakai-grader-file-picker button-text="${this.assignmentsI18n["gen.addatt"]}"
              style="display: inline-block;"
              title="${this.i18n.add_attachments_tooltip}">
          </sakai-grader-file-picker>
        </div>
        ${this.submission.hasHistory ? html`
          <div id="grader-submission-history-wrapper">
            <div id="grader-submission-history-toggle">
              <a href="javascript:;"
                @click=${() => this.showingHistory = !this.showingHistory}
                aria-label="${this.showingHistory ? this.i18n.hide_history_tooltip : this.i18n.show_history_tooltip}"
                title="${this.showingHistory ? this.i18n.hide_history_tooltip : this.i18n.show_history_tooltip}">
                ${this.showingHistory ? this.i18n.hide_history : this.i18n.show_history}
              </a>
            </div>
            <div id="grader-submission-history" style="display: ${this.showingHistory ? "block" : "none"}">
              ${this.submission.history.comments ? html`
                <div id="grader-history-comments-wrapper">
                  <div class="grader-history-title">${this.i18n.feedback_comments}</div>
                  <div class="grader-history-block">${unsafeHTML(this.submission.history.comments)}</div>
                </div>
              ` : ""}
              ${this.submission.history.grades ? html`
                <div id="grader-history-grades-wrapper">
                  <div class="grader-history-title">${this.i18n.previous_grades}</div>
                  <div class="grader-history-block">${unsafeHTML(this.submission.history.grades)}</div>
                </div>
              ` : ""}
            </div>
          </div>
        ` : ""}
        <div class="grader-label content-button-block grader-block">
          <button id="grader-private-notes-button"
              @click=${this.togglePrivateNotes}
              aria-haspopup="true"
              title="${this.i18n.private_notes_tooltip}">
            ${this.assignmentsI18n["note.label"]}
          </button>
          ${this.submission.privateNotes ? html`
            <div class="active-indicator ${this.savedPvtNotes ? "" : "unsaved"}"
                aria-label="${this.pvtNotePresentMsg()}"
                title="${this.pvtNotePresentMsg()}">
            </div>`
          : ""}
        </div>
        <div id="private-notes-panel" class="grader-panel" title="${this.assignmentsI18n["note.label"]}" style="display: none;">
          <div class="sak-banner-info">${unsafeHTML(this.i18n.private_notes_tooltip)}</div>
          <div id="private-notes-unsaved-msg" class="sak-banner-error hidden">${this.i18n.unsaved_text_warning}</div>
          <div><textarea id="grader-private-notes" .value=${this.submission.privateNotes}></textarea></div>
          <button @click=${this.doneWithPrivateNotesDialog}>${this.assignmentsI18n["gen.don"]}</button>
          <button @click=${this.cancelPrivateNotesToggle}>${this.assignmentsI18n["gen.can"]}</button>
        </div>
        <div class="text-feedback">
        </div>
        ${this.submission.submittedTime && !this.submission.showExtension ? html`
          <div class="resubmission-checkbox">
            <label>
              <input type="checkbox" .checked=${this.showResubmission} @change="${this.toggleResubmissionBlock}"/>
              <span>${this.assignmentsI18n.allowResubmit}</span>
            </label>
          </div>
          ${this.showResubmission ? html`
            <div class="resubmission-block">
              <span>${this.assignmentsI18n["allow.resubmit.number"]}:</span>
              <select aria-label="${this.i18n.attempt_selector_label}"
                  @change=${e => this.submission.resubmitsAllowed = parseInt(e.target.value)}>
                ${Array(10).fill().map((_, i) => html`
                  <option value="${i + 1}" .selected=${this.submission.resubmitsAllowed === (i + 1)}>${i + 1}</option>
                `)}
                <option value="-1" .selected=${this.submission.resubmitsAllowed === -1}>${this.i18n.unlimited}</option>
              </select>
              <span>${this.assignmentsI18n["allow.resubmit.closeTime"]}:</span>
              <sakai-date-picker
                  epoch-millis="${this.submission.resubmitDate}"
                  @datetime-selected=${this.resubmitDateSelected}
                  label="${this.assignmentsI18n["allow.resubmit.closeTime"]}">
              </sakai-date-picker>
            </div>
          ` : ""}
        ` : ""}
        ${this.submission.showExtension ? html`
          <div id="grader-extension-section">
            <input type="checkbox" .checked=${this.allowExtension} id="allowExtensionToggle" name="allowExtensionToggle" @change=${this.toggleExtensionBlock}" />
            <label for="allowExtensionToggle" >${this.assignmentsI18n.allowExtension}</label>
            ${this.allowExtension ? html`
              <div>${this.assignmentsI18n.allowExtensionCaptionGrader}</div>
              <div id="allowExtensionTime">
                <label>${this.assignmentsI18n["gen.acesubunt"]}</label>
                <sakai-date-picker
                    epoch-millis="${this.submission.extensionDate}"
                    @datetime-selected="${this.extensionDateSelected}"
                    label="${this.assignmentsI18n["gen.acesubunt"]}">
                </sakai-date-picker>
              </div>
            ` : ""}
          </div>
        ` : ""}
        <div class="action-button-block act">
          <button accesskey="s"
              class="btn btn-primary active"
              name="save"
              @click=${this.save}
              ?disabled=${!this.canSave}>
            ${this.assignmentsI18n["gen.sav"]}
          </button>
          <button accesskey="d"
              name="return"
              @click=${this.saveAndRelease}
              ?disabled=${!this.canSave}>
            ${this.assignmentsI18n["gen.retustud"]}
          </button>
          <button accesskey="x" name="cancel" @click=${this.cancel}>${this.assignmentsI18n["gen.can"]}</button>
        </div>
        ${this.saveSucceeded ? html`<div class="sak-banner-success">${this.i18n.successful_save}</div>` : ""}
        ${this.saveFailed ? html`<div class="sak-banner-error">${this.i18n.failed_save}</div>` : ""}
      </div>` : ""}
    `;
  }

  renderSubmitter() {

    return html`
      ${this.submission.groupId ? html`${this.submission.groupTitle}` : html`${this.submission.firstSubmitterName}`}
    `;
  }

  renderGraderReturned() {
    return html`<span class="grader-returned fa fa-eye" title="${this.i18n.returned_tooltip}" />`;
  }

  render() {

    return html`
      ${this.areSettingsInAction() ? html`
      <div class="sak-banner-warn">${this.i18n.filter_settings_warning}</div>
      ` : ""}
      <div class="grader-nav">
      ${this.renderNav()}
      </div>
      <div class="grader-container">
        ${this.graderOnLeft ? html`
        ${this.renderGrader()}
        ${this.renderGradable()}
        ` : html`
        ${this.renderGradable()}
        ${this.renderGrader()}
        `}
      </div>
    `;
  }

  _getPhotoUserId() {

    if (this.submission.groupId || this.gradable.anonymousGrading || !this.submission.firstSubmitterId) {
      return "blank";
    }

    return this.submission.firstSubmitterId;
  }

  toggleRubric() {

    if (!this.rubricShowing) {
      $("#rubric-panel").dialog({
        width: "70%",
        close: () => this.rubricShowing = false
      });
      this.rubricShowing = true;
      this.canSave = false;
    } else {
      try {
        $("#rubric-panel").dialog("destroy");
      } catch (error) {
        console.info(this.i18n.destroy_rubric_panel_log);
      }
      this.rubricShowing = false;
      this.canSave = true;
    }
  }

  doneWithRubricDialog() {

    this.toggleRubric();
    this.querySelector("#grader-rubric-link").focus();
  }

  cancelRubric() {

    const rubricGradingElem = document.getElementsByTagName("sakai-rubric-grading");
    if (rubricGradingElem.length <= 0) {
      return;
    }
    const rubricGrading = rubricGradingElem.item(0);
    rubricGrading && rubricGrading.cancel();
    this.rubricShowing && this.doneWithRubricDialog();
  }

  replaceWithEditor(id) {

    const editor = sakai.editor.launch(id, {
      autosave: { delay: 10000000, messageType: "no" },
      startupFocus: true,
    });

    editor.on("change", () => this.modified = true);
    editor.on("instanceReady", (e) => {
      e.editor.dataProcessor.writer.setRules('p', { breakAfterClose: false });
    });
    return editor;
  }

  toggleInlineFeedback(e, cancelling) {

    if (!this.feedbackTextEditor) {
      this.feedbackTextEditor = this.replaceWithEditor("grader-feedback-text-editor");
      this.feedbackTextEditor.setData(this.submission.feedbackText, () => this.modified = false);
      this.querySelector("#grader-feedback-text").style.display = "none";
      this.querySelector("#edit-inline-feedback-button").style.display = "none";
      this.querySelector("#show-inline-feedback-button").style.display = "block";
    } else {
      if (!cancelling) {
        this.submission.feedbackText = this.feedbackTextEditor.getData();
        this.requestUpdate();
      } else {
        this.feedbackTextEditor.setData(this.submission.feedbackText, () => this.modified = false);
      }
      this.feedbackTextEditor.destroy();
      this.feedbackTextEditor = undefined;
      this.querySelector("#grader-feedback-text").style.display = "block";
      this.querySelector("#edit-inline-feedback-button").style.display = "block";
      this.querySelector("#show-inline-feedback-button").style.display = "none";
      this.querySelector("#grader-feedback-text-editor").style.display = "none";
    }
  }

  toggleFeedback() {

    const feedbackPanel = $("#feedback-panel");

    if (!feedbackPanel.dialog("instance")) {
      feedbackPanel.dialog({
        width: "auto",
        beforeClose: () => this.cancelFeedbackToggle(),
      });
      this.feedbackCommentEditor = this.replaceWithEditor("grader-feedback-comment");
      this.canSave = false;
    } else {
      this.feedbackCommentEditor.destroy();
      feedbackPanel.dialog("destroy");
      this.canSave = true;
    }
  }

  doneWithFeedbackDialog() {

    this.submission.feedbackComment = this.feedbackCommentEditor.getData();
    this.modified = true;
    this.savedFeedbackComment = false;
    this.feedbackCommentEditor.resetDirty();
    this.toggleFeedback();
    document.getElementById("grader-feedback-button").focus();
  }

  cancelFeedbackToggle() {

    if (this.feedbackCommentEditor.checkDirty()) {
      if (this.confirmedNotSaveFeedback) {
        this.feedbackCommentEditor.setData(this.submission.feedbackComment, () => this.modified = false);
        this.feedbackCommentEditor.resetDirty();
        this.confirmedNotSaveFeedback = false;
        document.getElementById("feedback-comment-unsaved-msg").classList.add("hidden");
      } else {
        this.confirmedNotSaveFeedback = true;
        document.getElementById("feedback-comment-unsaved-msg").classList.remove("hidden");
        return false;
      }
    }

    this.toggleFeedback();
    return true;
  }

  cancelPrivateNotesToggle() {

    if (this.privateNotesEditor.checkDirty()) {
      if (this.confirmedNotSavePvtNotes) {
        this.privateNotesEditor.setData(this.submission.privateNotes, () => this.modified = false);
        this.privateNotesEditor.resetDirty();
        this.confirmedNotSavePvtNotes = false;
        document.getElementById("private-notes-unsaved-msg").classList.add("hidden");
      } else {
        this.confirmedNotSavePvtNotes = true;
        document.getElementById("private-notes-unsaved-msg").classList.remove("hidden");
        return false;
      }
    }

    this.togglePrivateNotes();
    return true;
  }

  togglePrivateNotes() {

    const privateNotesPanel = $("#private-notes-panel");

    if (!privateNotesPanel.dialog("instance")) {
      privateNotesPanel.dialog({
        width: "auto",
        beforeClose: () => this.cancelPrivateNotesToggle(),
      });
      this.privateNotesEditor = this.replaceWithEditor("grader-private-notes");
      this.canSave = false;
    } else {
      this.privateNotesEditor.destroy();
      privateNotesPanel.dialog("destroy");
      this.canSave = true;
    }
  }

  doneWithPrivateNotesDialog() {

    this.submission.privateNotes = this.privateNotesEditor.getData();
    this.modified = true;
    this.savedPvtNotes = false;
    this.privateNotesEditor.resetDirty();
    this.togglePrivateNotes();
    document.getElementById("grader-private-notes-button").focus();
  }

  feedbackCommentPresentMsg() {
    return this.submission.feedbackComment && this.savedFeedbackComment ? this.i18n.comment_present : this.i18n.unsaved_comment_present;
  }

  pvtNotePresentMsg() {
    return this.privateNotes && this.savedPvtNotes ? this.i18n.notes_present : this.i18n.unsaved_notes_present;
  }

  previewAttachment(e) {

    e.preventDefault();
    this.selectedAttachment = this.submission.submittedAttachments.find(sa => sa.url === e.target.dataset.url);
    const type = this.selectedAttachment.type;

    if (type === "text/html") {
      this.submittedTextMode = true;
    } else {
      this.submittedTextMode = false;
      this.previewMode = true;
      let preview = this.submission.previewableAttachments[this.selectedAttachment.ref];
      preview = (!preview && (type.startsWith("image/") || type.startsWith("video/") || this.previewMimetypes.includes(type))) ? this.selectedAttachment : preview;
      if (preview) {
        this.selectedPreview = preview;
      } else {
        this.selectedPreview = this.selectedAttachment;
        // If there's no preview, open in a new tab or download the attachment.
        window.open(this.selectedPreview.url, '_blank');
      }
    }
  }

  addRubricParam(e, type) {

    let name = `rbcs-${e.detail.evaluatedItemId}-${e.detail.entityId}-${type}`;
    if ("totalpoints" !== type && "state-details" !== type) name += `-${  e.detail.criterionId}`;
    this.rubricParams.set(name, type === "criterionrating" ? e.detail.ratingId : e.detail.value);
  }

  onTotalPointsUpdated(e) {

    if (this.rubricShowing) {
      this.submission.grade = e.detail.value;
      this.requestUpdate();
    }
  }

  onRubricRatingChanged(e) {

    this.addRubricParam(e, "criterion");
    this.addRubricParam(e, "criterionrating");
    this.submission.hasRubricEvaluation = true;
    this.requestUpdate();
  }

  onRubricRatingsChanged() {
    this.modified = true;
  }

  onRubricRatingTuned(e) {
    this.addRubricParam(e, "criterion-override");
  }

  onUpdateCriterionComment(e) {
    this.addRubricParam(e, "criterion-comment");
  }

  loadData(gradableId) {

    const doIt = data => {

      this.gradeScale = data.gradable.gradeScale;

      if (this.gradeScale === LETTER_GRADE_TYPE) {
        this.letterGradeOptions = data.letterGradeOptions.split(",");
      }

      if (this.submissionId) {
        this.submission = this.submissions.find(s => s.id === this.submissionId);
      }

      this.requestUpdate();
    };

    if (!this.gradableDataLoader) {
      this.gradableDataLoader = this.loadGradableData(gradableId, portal.siteId, this.submissionId);
    }
    this.gradableDataLoader.then(data => doIt(data));
  }

  /**
   * Bundle up and all the needed stuff, like the grade, rubric, instructor comments and attachments.
   */
  getFormData() {

    const formData = new FormData();

    formData.valid = true;

    this.querySelector("sakai-grader-file-picker").files.forEach((f, i) => formData.set(`attachment${i}`, f, f.name));
    formData.set("grade", this.submission.grade);
    this.querySelectorAll(".grader-grade-override").forEach(el => {
      if (el?.type !== "checkbox") {
        formData.set(`grade_submission_grade_${el.dataset.userId}`, el.value);
      } else if (el.checked) {
        formData.set(`grade_submission_grade_${el.dataset.userId}`, GRADE_CHECKED);
      }
    });

    if (this.gradeScale === SCORE_GRADE_TYPE && parseFloat(this.submission.grade.replace(",", ".")) > parseFloat(this.gradable.maxGradePoint.replace(",", "."))) {
      if (!confirm(this.tr("confirm_exceed_max_grade", [this.gradable.maxGradePoint], "grader"))) {
        formData.valid = false;
      } else {
        formData.set("grade", this.submission.grade);
      }
    }
    formData.set("feedbackText", this.submission.feedbackText);
    formData.set("feedbackComment", this.submission.feedbackComment);
    formData.set("privateNotes", this.submission.privateNotes);

    this.rubricParams.forEach((value, name) => formData.set(name, value));

    formData.set("studentId", this.submission.firstSubmitterId);
    formData.set("courseId", portal.siteId);
    formData.set("gradableId", this.gradableId);
    formData.set("submissionId", this.submission.id);

    if (this.showResubmission && this.submission.resubmitDate) {
      formData.set("resubmitNumber", this.submission.resubmitsAllowed);
      formData.set("resubmitDate", this.submission.resubmitDate);
    }
    if (this.allowExtension) {
      formData.set("extensionDate", this.submission.extensionDate);
    }
    formData.set("siteId", portal.siteId);

    if (this.debug) {
      // Display the key/value pairs
      for (const pair of formData.entries()) {
        console.debug(`${pair[0]  }: ${  pair[1]}`);
      }
    }

    return formData;
  }

  /**
   * Submit the data, but don't release.
   */
  save() {

    const formData = this.getFormData();
    if (formData.valid) {
      formData.set("gradeOption", "retract");
      this.submitGradingData(formData);
      const rubricGrading = document.getElementsByTagName("sakai-rubric-grading").item(0);
      rubricGrading && rubricGrading.save();
      this.savedFeedbackComment = true;
      this.savedPvtNotes = true;
    }
  }

  /**
   * Same as save, but release.
   */
  saveAndRelease() {

    const formData = this.getFormData();
    if (formData.valid) {
      formData.set("gradeOption", "return");
      this.submitGradingData(formData);
      const rubricGrading = document.getElementsByTagName("sakai-rubric-grading").item(0);
      rubricGrading && rubricGrading.release();
      this.savedFeedbackComment = true;
      this.savedPvtNotes = true;
    }
  }

  submitGradingData(formData) {

    fetch("/direct/assignment/setGrade.json", {
      method: "POST",
      cache: "no-cache",
      credentials: "same-origin",
      body: formData,
    }).then(r => r.json()).then(data => {

      const submission = new Submission(data, this.groups, this.i18n);

      submission.grade = formData.get("grade");

      this.querySelector("sakai-grader-file-picker").reset();
      this.submissions.splice(this.submissions.findIndex(s => s.id === submission.id), 1, submission);
      this.originalSubmissions.splice(this.originalSubmissions.findIndex(s => s.id === submission.id), 1, submission);
      this.modified = false;
      this.submission = submission;
      this.totalGraded = this.submissions.filter(s => s.graded).length;
      this.saveSucceeded = true;
      setTimeout(() => this.saveSucceeded = false, 2000);
    }).catch(e => {

      console.error(`Failed to save grade for submission ${this.submission.id}: ${e}`);
      this.saveFailed = true;
      setTimeout(() => this.saveFailed = false, 2000);
    });
  }

  resetEditors(cancelling) {

    if (this.feedbackCommentEditor) {
      this.feedbackCommentEditor.setData(this.submission.feedbackComment, () => this.feedbackCommentEditor.resetDirty());
    }

    if (this.privateNotesEditor) {
      this.privateNotesEditor.setData(this.submission.privateNotes, () => this.privateNotesEditor.resetDirty());
    }

    if (this.inlineFeedbackMode) {
      this.toggleInlineFeedback(null, cancelling);
    }
  }

  cancel() {

    if (!this.canNavigate()) {
      return;
    }
    const originalSubmission = Object.create(this.originalSubmissions.find(os => os.id === this.submission.id));
    const i = this.submissions.findIndex(s => s.id === this.submission.id);
    this.submissions.splice(i, 1, originalSubmission);

    this.submission = this.submissions[i];

    this.resetEditors(true);

    this.cancelRubric();

    this.modified = false;

    switch (this.gradeScale) {
      case SCORE_GRADE_TYPE: {
        const input = document.getElementById("score-grade-input");
        input  && (input.value = this.submission.grade);
        break;
      } case PASS_FAIL_GRADE_TYPE: {
        const input = document.getElementById("pass-fail-selector");
        input  && (input.value = this.submission.grade);
        break;
      } case LETTER_GRADE_TYPE: {
        const input = document.getElementById("letter-grade-selector");
        input  && (input.value = this.submission.grade);
        break;
      } case CHECK_GRADE_TYPE: {
        const input = document.getElementById("check-grade-input");
        input && (input.checked = this.submission.grade === this.assignmentsI18n["gen.checked"] || this.submission.grade === GRADE_CHECKED);
        break;
      }
      default:
    }
  }

  clearSubmission() {

    const currentIndex = this.submissions.findIndex(s => s.id === this.submission.id);
    this.submissions[currentIndex] = this.nonEditedSubmission;
    this.querySelector("sakai-grader-file-picker").reset();
    this.querySelector("sakai-rubric-grading")?.cancel();
    return true;
  }

  canNavigate() {

    // Deal with the right pane not present
    const nFiles = this.querySelector("sakai-grader-file-picker")?.files.length;
    return this.modified || nFiles
      ? (confirm(this.i18n.confirm_discard_changes) ? this.clearSubmission() : false) : true;
  }

  toStudentList(e) {

    e.preventDefault();
    if (this.canNavigate()) {
      location.href = this.userListUrl;
    }
  }

  validateGradeInput(e) {

    if (e.key === "Tab") return;

    const decimalSeparator = (1.1).toLocaleString(portal.locale).substring(1, 2);
    const rgxp = new RegExp(`[\\d${decimalSeparator}]`);

    if (e.key === "Backspace" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      return true;
    } else if (!e.key.match(rgxp)) {
      e.preventDefault();
      return false;
    }
    const number = e.target.value.replace(",", ".");

    const numDecimals = number.includes(".") ? number.split(".")[1].length : 0;

    // If the user has highlighted the current entry, they want to replace it.
    if (numDecimals === 2 && ((e.target.selectionEnd - e.target.selectionStart) < e.target.value.length)) {
      e.preventDefault();
      return false;
    }
  }

  gradeSelected(e) {

    if (this.gradeScale === CHECK_GRADE_TYPE) {
      if (e.target.checked) {
        this.submission.grade = GRADE_CHECKED;
      } else {
        this.submission.grade = "Unchecked";
      }
      this.isChecked = e.target.checked;
    } else {
      this.submission.grade = e.target.value;
    }
    this.modified = true;
  }

  previous() {

    const currentIndex = this.submissions.findIndex(s => s.id === this.submission.id);

    if (currentIndex >= 1) {
      if (!this.canNavigate()) {
        return;
      }
      if (this.feedbackTextEditor) {
        this.toggleInlineFeedback(null, true);
      }
      this.submission = this.submissions[currentIndex - 1];
    }
  }

  studentSelected(e) {

    if (!this.canNavigate()) {
      return;
    }

    this.submission = this.submissions.find(s => s.id === e.target.value);
  }

  next() {

    const currentIndex = this.submissions.findIndex(s => s.id === this.submission.id);

    if (currentIndex < this.submissions.length - 1) {
      if (!this.canNavigate()) {
        return;
      }
      if (this.feedbackTextEditor) {
        this.toggleInlineFeedback(null, true);
      }
      this.submission = this.submissions[currentIndex + 1];
    }
  }

  closer(e) {

    if (!this.querySelector("#grader-settings").contains(e.target)) {
      this.toggleSettings(e, true);
    }
  }

  toggleSettings(e, hide) {

    e.preventDefault();
    e.stopPropagation();
    const settingsPanel = this.querySelector(`.settings`);
    if ((!settingsPanel.style.display || settingsPanel.style.display === "none") && !hide) {
      settingsPanel.style.display = "block";
      settingsPanel.querySelectorAll("input")[0].focus();
      this.addEventListener("click", this.closer);
    } else {
      settingsPanel.style.display = "none";
      this.removeEventListener("click", this.closer);
    }
  }

  applyFilters(e) {

    e.stopPropagation();

    this.submissions = [...this.originalSubmissions];

    if (this.ungradedOnly) {
      this.submissions = this.submissions.filter(s => !s.graded);
    }

    if (this.submittedOnly) {
      this.submissions = this.submissions.filter(s => s.submittedTime !== "");
    }

    if (!this.ungradedOnly && !this.submittedOnly) {
      this.submissions = [...this.originalSubmissions];
    }

    if (this.currentGroup && this.currentGroup !== `/site/${portal.siteId}`) {
      const group = this.groups.find(g => g.reference === this.currentGroup);
      this.submissions = this.submissions.filter(s => group.users.includes(s.firstSubmitterId));
    }

    this.submissions.sort((a, b) => a.firstSubmitterName.localeCompare(b.firstSubmitterName));

    if (this.submissions.length > 0) {
      this.submission = this.submissions[0];
    } else {
      this.submission = new Submission();
    }
    this.totalGraded = this.submissions.filter(s => s.graded).length;
  }

  submittedOnlyChanged(e) {

    this.submittedOnly = e.target.checked;
    this.applyFilters(e);
  }

  areSettingsInAction() {

    return (this.currentGroup && this.currentGroup !== `/site/${portal.siteId}`) || this.submittedOnly || this.ungradedOnly;
  }

  removeAttachment(e) {

    e.stopPropagation();
    e.preventDefault();

    if (confirm(this.i18n.confirm_remove_attachment)) {

      const ref = e.target.dataset.ref;

      fetch(`/direct/assignment/removeFeedbackAttachment?gradableId=${this.gradableId}&submissionId=${this.submission.id}&ref=${encodeURIComponent(ref)}`).then(r => {

        if (r.status === 200) {
          this.submission.feedbackAttachments.splice(this.submission.feedbackAttachments.findIndex(fa => fa.ref === ref), 1);
          this.requestUpdate();
        }
      }).catch(error => console.error(`Failed to remove attachment on server: ${error}`));
    }
  }

  groupSelected(e) {

    this.currentGroup = e.detail.value;
    this.applyFilters(e);
  }

  ungradedOnlyChanged(e) {

    this.ungradedOnly = e.target.checked;
    this.applyFilters(e);
  }

  graderOnLeftChanged(e) {

    e.stopPropagation();

    this.graderOnLeft = e.target.checked;
    this.setSetting("grader", "graderOnLeft", e.target.checked);
  }

  resubmitDateSelected(e) {

    this.submission.resubmitDate = e.detail.epochMillis;
    this.modified = true;
  }

  extensionDateSelected(e) {

    this.submission.extensionDate = e.detail.epochMillis;
    this.modified = true;
  }

  onSettingsKeydown(e) {

    if (e.key === "Escape") {
      this.toggleSettings(e);
      this.querySelector(`#settings-link`).focus();
    }
  }

  toggleResubmissionBlock(e) {

    if (!e.target.checked) {
      this.submission.resubmitsAllowed = 0;
    } else {
      this.submission.resubmitsAllowed = 1;
    }
    this.showResubmission = e.target.checked;
  }

  toggleExtensionBlock(e) {

    this.submission.extensionAllowed = !e.target.checked;
    this.allowExtension = e.target.checked;
  }
}

const tagName = "sakai-grader";
!customElements.get(tagName) && customElements.define(tagName, SakaiGrader);
