export default function Bylaws() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Association Bylaws</h1>
        <a
          href="/api/bylaws"
          download="LiveOaks_Bylaws.pdf"
          className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PDF
        </a>
      </div>

      <p className="text-xs text-gray-400 mb-6">Restated January 1, 2007 including amendments to date</p>

      <div className="space-y-6 text-sm text-gray-700">

        <Article title="Article I: Organization">
          <Section n="1">
            The name of this organization is the "Live Oaks Tennis Association". It is a not-for-profit
            organization which does not contemplate pecuniary gain or profit to the members. It is organized
            to promote the game of tennis among its members.
          </Section>
          <Section n="2">
            The Club shall have a seal which shall consist of the following design: The words "Live Oaks
            Tennis Association" in a circle, and within the circle the words, "Incorporated November 19th, 1926".
          </Section>
        </Article>

        <Article title="Article II: Board of Directors">
          <Section n="1">
            The Board of Directors shall consist of seven (7) members of the Club, each of whom shall be
            entitled to vote upon all matters coming before the Board of Directors. The term of office shall
            be two years and no director shall serve more than two consecutive terms unless elected President
            following the second term, in which case the maximum number of years served would be six.
          </Section>
          <Section n="2">
            Subject to the restrictions of Section 3, the Board of Directors shall have general charge of
            the affairs, funds and property of the Club, including the power and authority:
            <ol className="list-[lower-alpha] ml-6 mt-2 space-y-1">
              <li>To make rules for the use of the Clubhouse, tennis courts, and the Club property and for the conduct of the members of the Club on Club property;</li>
              <li>To fix and enforce penalties for any violations by members of the Bylaws and Rules of the Club;</li>
              <li>To fix dues, assessments, admission, transfer and other fees and charges;</li>
              <li>To remit or suspend dues, assessments, fees, or other charges;</li>
              <li>To establish rules for the admission and privileges of guests of the Club;</li>
              <li>To fill vacancies in the Board of Directors or vacancies among the officers of the Club;</li>
              <li>To select one or more tennis professionals for the Club and to establish conditions and restrictions on the use of the Club property by such professionals; and</li>
              <li>To do all things necessary and not inconsistent with laws of the State of California, the Articles of Incorporation of the Club and these Bylaws, to manage the affairs and property of the Club.</li>
            </ol>
          </Section>
          <Section n="3">
            The Board of Directors shall not have authority to take any of the following actions unless such
            action is approved by the vote of a majority of the members of the Club:
            <ol className="list-[lower-alpha] ml-6 mt-2 space-y-1">
              <li>To create indebtedness for borrowed money;</li>
              <li>To incur charges for services or for repairs or improvements to the Club property, for a single project where the cost exceeds $10,000;</li>
              <li>To raise the dues by more than 50% in any twelve (12) month period; and</li>
              <li>To assess the members more than $100.00 in any twelve (12) month period.</li>
            </ol>
          </Section>
          <Section n="4">
            Any Director may be removed from office by the vote of two-thirds of the total number of the
            members of the Club.
          </Section>
          <Section n="5">
            A vacancy in the Board of Directors caused by the death, resignation, incompetency or removal of
            any Director may be filled by the vote of a majority of the remaining Directors, except that if
            four or more vacancies exist at any time, a special meeting of the members shall be called for
            the purpose of filling such vacancies.
          </Section>
          <Section n="6">
            An organization meeting of the Board of Directors shall be held each year on the day of the
            Annual Meeting of members. The Board of Directors shall meet not less than quarterly at such time
            as may be determined by resolution of the Board. No notice of such meeting need be given. Special
            meetings of the Board of Directors may be called at any time by the President or three of the
            Directors. Notices of any special meetings shall be given by the Secretary at least three (3)
            days in advance of the meeting. In the event all the Directors are present at a special meeting
            of the Board, or sign a written waiver of notice and consent to holding a meeting of the board,
            any business may be transacted at a special meeting called in accordance with the above-mentioned
            procedure.
          </Section>
          <Section n="7">
            A majority of the Directors present at any regular, special or adjourned meeting of the Board,
            even in the absence of a quorum, may adjourn the meeting to meet again at a specified time and
            place. The Secretary shall give immediate notice of the adjournment, and of the time and place
            of the adjourned meeting, to each absent Director.
          </Section>
          <Section n="8">
            A majority of the authorized number of Directors shall be necessary to constitute a quorum of
            the Board for the transaction of business.
          </Section>
          <Section n="9">
            Every act or decision done or made by a majority of the Directors present at a meeting duly held
            at which a quorum is present shall be the act of the Board of Directors, unless a greater number
            is required by law.
          </Section>
          <Section n="10">
            Any action by the Board of Directors may be taken without a meeting if all members of the Board
            shall individually or collectively consent in writing to such action, and such action shall have
            the same force and effect as the unanimous vote of such Directors.
          </Section>
        </Article>

        <Article title="Article III: Officers">
          <Section n="1">
            The officers of the Club shall be a President, a Vice-President, a Secretary and a Treasurer,
            each of whom must also be a Director. The Board may also appoint one or more Assistant
            Secretaries, one or more Assistant Treasurers, and such officers and agents as it may deem
            advisable.
          </Section>
          <Section n="2">
            All officers shall be elected by the Board of Directors at its first meeting following the
            Annual Meeting of members of the Club. Each officer of the Club shall hold office only during
            the pleasure of the Board of Directors or until resignation.
          </Section>
          <Section n="3">
            Any officer may resign at any time by giving written notice of his resignation to the Board of
            Directors. Such resignation shall take effect at the time of the receipt of such notice or at
            any later time specified therein, and, unless otherwise specified in such notice, no acceptance
            of such resignation shall be necessary to make it effective.
          </Section>
          <Section n="4">
            The President shall preside at all general business meetings of the Club's membership and of
            the Board of Directors, and shall carry into effect the resolutions of the Directors and enforce
            the provisions of the Bylaws. The President shall have general supervision of the Club and its
            affairs and shall be an ex officio member of all of the Club's committees. The President shall
            select, with the advice and consent of the Board of Directors, all members of standing
            committees of the Club. At the annual meeting of the Club, the President shall render a report
            for the year and shall cause to be rendered to the Club a full account of its finances. The
            President shall do and perform all acts and duties assigned by these Bylaws and such other and
            further acts and duties as may from time to time be assigned by the Board of Directors.
          </Section>
          <Section n="5">
            In the absence of the President, the Vice-President shall do and perform all the duties of the
            President. The Vice-President shall also perform and do such other duties as may be assigned by
            the Board of Directors.
          </Section>
          <Section n="6">
            The Secretary shall be the custodian of all books and records and of the seal of the Club. The
            Secretary shall keep a record of the proceedings of the Club and the Board of Directors, and
            shall do and perform all acts and duties assigned by these Bylaws and such other and further
            acts and duties as may be assigned from time to time by the Board of Directors.
          </Section>
          <Section n="7">
            The Treasurer shall have custody of the Club's funds, shall keep full and accurate accounts of
            all receipts and disbursements, and shall deposit such funds in such depositories as from time
            to time may be authorized by the Board of Directors. The Treasurer shall disburse the funds of
            the Club. The Treasurer shall render to the Board and the President, whenever so required, an
            account of all transactions as Treasurer and a report on the financial condition of the Club and
            the financial results of its operations.
          </Section>
        </Article>

        <Article title="Article IV: Members">
          <Section n="1">
            The members of the Club shall be classified as Active Members of the Club. A member may at any
            time request "Inactive Member" status. Upon Membership Committee approval of such request the
            requesting member's name shall be removed from the Active Member list and placed, alphabetically,
            on the Inactive Member list; the vacancy thus created in the Active Member roster shall be filled
            from the appropriate applicant list. An Inactive Member shall not be considered a member or
            Associate but shall pay such fees and participate in such Club privileges and under such club
            obligations and restrictions as the Board shall from time to time specify.
          </Section>
          <Section n="2">The total number of Active Members shall not exceed 110.</Section>
          <Section n="3">
            Each member shall have the right to use the Clubhouse and the Club's tennis courts, subject to
            the restrictions of the Bylaws, the house and Club Rules, and any other regulations that may be
            adopted from time to time by the Board of Directors. Spouses and children of members shall have
            such rights to use the Clubhouse and the Club's tennis courts as the Board of Directors may from
            time to time permit.
          </Section>
          <Section n="4">
            Each member shall have the right to vote for the election of Directors and on every other matter
            submitted to the vote of the members.
          </Section>
          <Section n="5">
            No member shall have any proprietary interest in the assets of the Club except that, upon the
            dissolution or winding up of the Club, the net assets remaining after the Club's debts,
            obligations and liabilities have been paid or adequately provided shall be divided and
            distributed equally among the members.
          </Section>
          <Section n="6">
            Each member, upon payment of all dues, fees, assessments and charges owed shall have the right
            to resign at any time by giving the Secretary written notice of resignation.
          </Section>
          <Section n="7">No member shall have the right to transfer his membership to any other person. (See Section 13).</Section>
          <Section n="8">
            If it is determined that a member has any right by law to transfer his membership contrary to
            the provisions of these Bylaws, then such transfer shall be made only to an applicant who has
            been approved for membership in accordance with the provisions of Sections 1 through 4 of
            Article V of these Bylaws and such transfers shall be effective only upon payment to the Club
            by the transferee of a transfer fee of $1,250.00 or such greater amount as the Board of
            Directors may determine by resolution.
          </Section>
          <Section n="9">
            Each member admitted to membership shall pay an admission fee of not less than $1,250.00 and
            such periodic dues, fees, assessments and other charges as shall be determined by the Board of
            Directors from time to time.
          </Section>
          <Section n="10">
            The membership of any member shall be terminated upon resignation, death or judicially declared
            incompetency (provided all dues, assessments and charges owed have been paid). The termination
            of the membership of any member shall terminate all of such member's rights and privileges in
            the Club and the right to share in any eventual distribution of its assets. Effective on the
            date of adoption of these Bylaws no such terminated member shall be entitled to the return of
            the admission fee or any other dues, fees, charges and assessments.
          </Section>
          <Section n="11">
            All dues and charges of members of the Club shall be due and payable quarterly. Dues are payable
            in advance and dues and other charges shall become delinquent if not paid on or before the first
            day of the second month of such quarter. Any delinquent member shall receive a written request
            through the mail to pay any delinquency. If such delinquency is not paid by the end of such
            quarter the member's name, together with amount owing to the Club, shall be posted by the
            Treasurer on the Clubhouse bulletin board and such delinquent member shall not be entitled to
            play tennis on the Club's courts or otherwise use the Club facilities until the delinquency has
            been paid. If such delinquent amount is not paid by the end of the following quarter the
            delinquent member shall automatically cease to be a member of the Club; provided, however, that
            said member may, within thirty (30) days after ceasing to be a member and upon prior payment to
            the Treasurer of all sums that are delinquent, petition the Board of Directors in writing for
            reinstatement and the Board may, in its discretion, reinstate such delinquent member. All
            notices sent under this provision shall make specific reference to this Section 11 of Article
            IV of the Bylaws.
          </Section>
          <Section n="12">
            The Board shall have the power to take such action as it may deem necessary and advisable to
            enforce compliance with the Bylaws and the court or house rules. In the event of any violation
            of the Bylaws, court or house rules, or any other regulation adopted by the Board, in the event
            of any conduct which in the opinion of the Board is likely to endanger the welfare, interests or
            character of the Club, the Board's disciplinary power shall include, but not be limited to, the
            power to reprimand the infringing member either privately or publicly, to require an apology or
            reparation, to impose a fine, to suspend the member's privileges, to terminate the membership,
            or to impose any other penalty which in its judgment is appropriate.
            <p className="mt-2">
              The Board shall terminate or suspend a member only after giving such member written notice of
              the alleged offending occurrence and giving such member, if so requested, a hearing in person
              before the Board. In the event of the termination of any member by the Board of Directors,
              such member may appeal from such order of termination by obtaining and presenting to the Board
              of Directors, within thirty (30) days of such expulsion, a request, signed by at least twelve
              (12) members, requesting a review of the act of the Board of Directors and an appeal therefrom.
            </p>
            <p className="mt-2">
              The Board of Appeal shall consist of all then members of the Club who have served as President
              of the Club, are not presently on the Board of Directors and who are then residents of Los
              Angeles County, and such persons are hereby declared to be a Board of Appeal which shall
              review the act of the Board of Directors. It shall be the duty of such Board of Appeal to
              convene and hear any appeal properly made and it shall have power, by a majority action taken
              at a meeting at which a majority of eligible members (but in no event less than three) are
              present, either to ratify, modify or reverse the action of the Board of Directors in event of
              termination of the membership of any member of the Club. The most senior member of such Board
              of Appeal, in point of time of election to the presidency of the Club, shall be the presiding
              officer of such Board of Appeal.
            </p>
          </Section>
          <Section n="13">
            Subject to Board approval, a deceased member's spouse may be invited to assume that vacated
            membership.
          </Section>
        </Article>

        <Article title="Article V: Application for Membership">
          <Section n="1">
            Applications for membership shall be in writing in the form prescribed by the Board, signed by
            the applicant and setting forth the recommendation of two (2) members of the Club. The
            application shall be delivered to the chairman of the Membership Committee. Applicants for
            membership of this association must be at least 21 years of age at the time such application
            is made.
          </Section>
          <Section n="2">
            If an application is received when there are no openings in the membership, the applicant shall
            be placed at the bottom of a FIRST waiting list. If an application is received from the son or
            daughter of a member, the applicant shall be placed at the bottom of a SECOND waiting list
            reserved for children of members. The waiting lists shall be maintained in chronological order
            based on the date on which the Chairman of the Membership Committee received an application in
            proper form. Placing of an applicant's name on the waiting list does not signify that an
            applicant has in any respect been approved for membership, and all members and applicants placed
            on the waiting list shall be informed.
            <p className="mt-2">
              Should an Inactive Member wish to resume Active Member status, he shall so notify the
              Membership Committee chairman, who shall immediately move the requesting person's name from
              the Inactive Member list to the top of the first (regular) Applicant list; while so listed the
              applicant may continue to play under the rules applicable to Inactive Members, but otherwise
              the admission procedure of Section 3 of this Article and Section 9 of Article IV shall apply.
            </p>
          </Section>
          <Section n="3">
            When it appears that an applicant on the top of the waiting list may be eligible for admission
            to the Club because of a vacancy or prospective vacancy in the membership, the Membership
            Committee shall make such inquiries concerning the applicant as it deems desirable in order to
            permit the Membership Committee to make a recommendation to the Board of Directors regarding
            such applicant's admission to membership. The members of the Membership Committee shall play
            tennis with the applicant and encourage the applicant to play tennis with and become acquainted
            with other members of the Club. During such period when an applicant is being actively
            considered for membership, an applicant may be permitted limited use of the facilities of the
            Club, subject to such restrictions and charges as the Board may impose. During the period of
            active evaluation of an applicant's qualification for membership, the applicant's name and
            address shall be posted on the bulletin board of the Clubhouse for information of the Club
            members.
          </Section>
          <Section n="4">
            After two applicants from the first waiting list have been accepted to membership in the club,
            the next name to be considered for membership will be taken from the second waiting list. The
            Membership Committee shall evaluate such application in the same manner as an application from
            the first waiting list until an applicant has been accepted into membership. Thereafter, the
            process of accepting applicants for membership shall follow the same pattern with one application
            from the second waiting list being accepted for each two applications accepted from the first
            waiting list.
          </Section>
          <Section n="5">
            It is recognized that it is in the interest of the Club to admit members who have attained some
            proficiency in playing tennis. Therefore, the Membership Committee and the Board of Directors
            shall take into account an applicant's playing ability in recommending or voting for an
            applicant's admission to membership.
          </Section>
          <Section n="6">
            Every person elected to membership in the Club shall be deemed to have knowledge of all Bylaws
            and Rules of the Club, and to accept such membership with the understanding that his interest,
            rights and privileges in the Club, and in its property and assets are governed solely by the
            Bylaws of the Club in force at the time of his election and that such Bylaws are subject to
            amendment or repeal, and that no officer, Director or member of the Club has any power or
            authority to make any representations or agreements defining or fixing the rights, interests and
            privileges of any member in the Club contrary to the provisions of the Bylaws. Every person
            elected to membership in the Club shall be given a copy of the current Bylaws and Rules.
          </Section>
          <Section n="7">
            The Secretary shall keep a Membership Book containing the name and address of each member. The
            termination of any member shall be recorded in the book, together with the date on which such
            membership ceased. Membership in the Club shall not be evidenced by certificates, and any
            certificates issued prior to May 1, 1976 shall be returned to the Secretary of the Club.
          </Section>
        </Article>

        <Article title="Article VI: Meetings of Members">
          <Section n="1">
            The Annual Meeting of the members shall be held at 4:30 p.m. on the first Saturday of May of
            each year upon the Club grounds. No notice of the Annual Meeting need be given.
          </Section>
          <Section n="2">
            At least sixty (60) days prior to the date of each annual meeting of members, the President,
            with the approval of the Board, shall appoint a Nominating Committee, consisting of the
            incumbent President and two former Presidents of the Club. The Nominating Committee by a
            majority vote shall nominate a ticket of members for each present or impending vacancy in the
            membership of the Board. The report of the Nominating Committee shall be posted on the
            Clubhouse bulletin board not later than thirty (30) days prior to the date of the Annual Meeting
            and shall remain posted until the annual election.
          </Section>
          <Section n="3">
            At any time after the report of the Nominating Committee is posted and not less than fifteen
            (15) days prior to the date of the Annual Meeting, any ten (10) members of the Club may make
            other nominations for one or more Directors by filing with the Secretary of the Club a signed
            notice in writing of such nominations requesting that certain additional names of nominees shall
            be voted upon at the annual meeting and thereupon such person or persons shall be considered
            nominated.
          </Section>
          <Section n="4">
            No person shall be eligible for election to Director unless he has been nominated in accordance
            with the provisions of Section 2 or Section 3 of Article VI.
          </Section>
          <Section n="5">
            If any candidates for Director have been nominated other than those proposed by the Nominating
            Committee, it shall be the duty of the Secretary, at least ten (10) days prior to the Annual
            Meeting, to mail to each member of the Club a ballot on which shall be placed in alphabetical
            order the names of all the nominees. The ballot shall inform each member how many of the
            nominees he may vote for. Cumulative voting shall not be permitted.
          </Section>
          <Section n="6">
            The Board of Directors shall appoint three Judges of Election from the membership of the Club
            to supervise the election, of whom one shall be chairman. In the event ballots are sent to
            members as provided in Section 5, the ballot shall be accompanied by a stamped envelope
            addressed to the chairman of the Judges of Election.
          </Section>
          <Section n="7">
            In the event ballots are mailed to members as provided in Section 5, it shall be the duty of
            the Judges of Election to receive the ballots as returned, count them and to report to the
            President, in writing, the number of votes cast for each candidate. The nominees receiving the
            highest number of votes shall be elected. The President shall declare the result of the election
            at the annual meeting.
          </Section>
          <Section n="8">
            In the event no nominations are made for Director other than those persons nominated by the
            Nominating Committee, no ballot shall be mailed to members. Instead the vote for Directors
            shall be taken by oral or written vote immediately prior to the commencement of the Annual
            Meeting on the first Saturday of May. The polls shall open at 4:00 p.m. and should be kept
            open until 4:30 p.m. The Judges of Election shall count the ballots at the close of the polls
            at 4:30 p.m. and report to the President the results of such election.
          </Section>
          <Section n="9">
            The decision of the Judges of Election on any question arising as to the voting or balloting
            for Director shall be final unless reversed by action of the membership at the Annual Meeting.
          </Section>
          <Section n="10">
            Each Annual Meeting shall be convened at 4:30 p.m. on the day of the meeting and the business
            of the meeting shall be taken up in the following order: First, the reading of the minutes of
            the preceding meeting, unless the reading of the minutes is waived by voice vote of the members
            present; Second, annual report of the President and any other report concerning the affairs of
            the Club; Third, any matters other than those on which the members have voted; and Fourth,
            report of the Judges of Election as to the election of Directors and as to the votes cast on
            any other matter submitted to the vote of the members.
          </Section>
          <Section n="11">
            Special meetings of the Club may be called at any time by the Board of Directors or upon the
            request in writing of at least fifteen (15) members. Notice stating the time, place and business
            to be transacted at a special meeting shall be mailed to all members at least ten (10) days
            prior to such meeting and only such matters specified in the notice shall be acted upon at such
            special meeting.
          </Section>
          <Section n="12">
            All meetings of the Club shall be held at the Clubhouse unless otherwise specifically directed
            by the Board of Directors.
          </Section>
          <Section n="13">
            At any meeting of the members, 20 members present (whether by ballot, in person or by proxy)
            shall be deemed to constitute a quorum. Any action taken at a meeting at which a quorum is
            present shall be deemed to be the action of the members of the Club (except for Article II,
            Section 3 &amp; 4).
            <p className="mt-2">
              Any matter requiring the vote or consent of the members of the Club may be voted upon by
              mail, by ballot or by personal solicitation of written consent from members. Unless the vote
              is taken at a duly called meeting of the members, an action requiring the affirmative vote of
              two-thirds or a majority, respectively, of the members voting on the matter (except for
              Article II, Section 3 &amp; 4).
            </p>
          </Section>
          <Section n="14">
            At any meeting of the members, a proxy shall be recognized if it is in writing, limited to not
            exceed thirty (30) days from its date, made in favor of a member in good standing entitled to
            vote and filed with the Secretary at the meeting or within ten (10) days prior thereto.
          </Section>
        </Article>

        <Article title="Article VII: Committees">
          <Section n="1">
            The President shall appoint annually, with the approval of the Board, the following standing
            committees and a chairman of each:
            <ul className="list-disc ml-6 mt-2 space-y-0.5 font-medium">
              <li>Membership</li>
              <li>House and Grounds</li>
              <li>Entertainment</li>
              <li>Tournaments and out of town events</li>
              <li>Rules</li>
            </ul>
          </Section>
          <Section n="2">
            All committees of the Club shall be subject to the direction of the Board of Directors and
            shall hold office only during the pleasure of the Board. The President of the Club shall be an
            ex officio member of each committee.
          </Section>
          <Section n="3">
            The Membership Committee, subject to the provisions of these Bylaws, shall be responsible for
            recommending the election of members to the Club and such other matters pertaining to members
            and memberships as may be delegated to it by the Board of Directors, including those provided
            for in Article V of these Bylaws.
          </Section>
          <Section n="4">
            The House and Grounds Committee shall have charge of the Clubhouse, grounds and property of
            the Club including the tennis courts. It shall make recommendations regarding all maintenance
            purchases, repairs and capital improvements of the Club.
          </Section>
          <Section n="5">
            The Entertainment Committee shall have charge of all entertainment given by the Club provided,
            however, that its activities in connection with tournaments sponsored by the Club shall be
            subject to the supervision by the Tournament Committee.
          </Section>
          <Section n="6">
            The Tournament Committee shall be responsible for scheduling and conducting all tournaments
            involving the members of the Club.
          </Section>
          <Section n="7">
            The Rules Committee shall be responsible for promulgating rules and regulations governing use
            of the Club's tennis courts.
          </Section>
          <Section n="8">
            The President may appoint, with the approval of the Board of Directors, such other committees,
            and chairman of each, as may from time to time be authorized by resolution of the Board.
          </Section>
        </Article>

        <Article title="Article VIII: Limitation of Liability">
          <p className="leading-relaxed">
            The Club shall not be liable or responsible for any injury received at or upon the Club property
            by any member, guest or their families. Members, guests and visitors shall assume all risk
            occasioned by the use of the Club's property.
          </p>
        </Article>

        <Article title="Article IX: Amendment of Bylaws">
          <Section n="1">
            The power to repeal and amend these Bylaws and adopt new Bylaws is hereby delegated to the
            Board of Directors, subject to the conditions set forth in this Article.
          </Section>
          <Section n="2">
            If the Board of Directors shall desire to repeal or to amend these Bylaws or to adopt new
            Bylaws, it shall pass a resolution of intention to take such action, setting out in such
            resolutions a copy of any Bylaws to be repealed or adopted and in the case of the desired
            amendments setting out a copy of the Bylaw intended to be amended and of the Bylaw as it will
            read after amendment. The Board shall post a copy of said resolution upon the Clubhouse
            bulletin board and shall cause a copy of said resolution to be mailed to members of the Club.
          </Section>
          <Section n="3">
            If within fourteen (14) days after the posting and mailing of said resolutions, ten (10) or
            more members shall notify the Secretary in writing that they object to the action proposed to
            be taken by the Board, such action shall not be taken unless it is approved by the vote of a
            majority of the members.
          </Section>
          <Section n="4">
            If within said period of fourteen (14) days no objection to the proposed action is filed with
            the Secretary by ten or more members, the Board of Directors shall have the power to make a
            change in the Bylaws proposed in such resolution of intention.
          </Section>
        </Article>

      </div>
    </div>
  )
}

function Article({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-base font-bold text-gray-800 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Section({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="leading-relaxed">
      <span className="font-semibold text-gray-800">Section {n}. </span>
      {children}
    </div>
  )
}
