import { useState } from 'react';
import { useSubmitContactInquiry } from '@/hooks/useContactInquiries';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { submit, submitting } = useSubmitContactInquiry();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error: submitError } = await submit(formData);
    if (submitError) {
      setError(submitError);
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20">
      {/* Header */}
      <section className="bg-white py-12 md:py-16 border-b">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-charcoal">Contact Us</h1>
            <p className="mt-2 text-charcoal/70 max-w-2xl">
              Have questions or feedback? We would love to hear from you. Reach out and our team will get back to you within 24 hours.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Contact Info */}
              <div>
                <h2 className="text-2xl font-bold text-charcoal mb-6">Get in Touch</h2>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <div className="w-6 h-6 flex items-center justify-center">
                        <i className="ri-mail-line text-brand" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal">Email</h4>
                      <p className="text-sm text-charcoal/70 mt-1">hello@rentconnect.com</p>
                      <p className="text-sm text-charcoal/70">support@rentconnect.com</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <div className="w-6 h-6 flex items-center justify-center">
                        <i className="ri-phone-line text-brand" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal">Phone</h4>
                      <p className="text-sm text-charcoal/70 mt-1">+91 98765 43210</p>
                      <p className="text-sm text-charcoal/70">Mon-Sat, 9am-7pm IST</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <div className="w-6 h-6 flex items-center justify-center">
                        <i className="ri-map-pin-line text-brand" />
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-charcoal">Office</h4>
                      <p className="text-sm text-charcoal/70 mt-1">123 Innovation Drive</p>
                      <p className="text-sm text-charcoal/70">Bandra Kurla Complex, Mumbai 400051</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="font-semibold text-charcoal mb-4">Follow Us</h3>
                  <div className="flex items-center gap-4">
                    <a href="#" className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-brand" rel="nofollow">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-linkedin-fill" />
                      </div>
                    </a>
                    <a href="#" className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-brand" rel="nofollow">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-twitter-x-fill" />
                      </div>
                    </a>
                    <a href="#" className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-brand" rel="nofollow">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-instagram-line" />
                      </div>
                    </a>
                    <a href="#" className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center hover:bg-brand hover:text-white transition-colors text-brand" rel="nofollow">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className="ri-facebook-fill" />
                      </div>
                    </a>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-black/5">
                {submitted ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                      <div className="w-8 h-8 flex items-center justify-center">
                        <i className="ri-check-line text-green-600 text-2xl" />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-charcoal">Message Sent!</h3>
                    <p className="text-charcoal/70 mt-2">Thank you for reaching out. We will get back to you within 24 hours.</p>
                  </div>
                ) : (
                  <form
                    id="contact-form"
                    onSubmit={handleSubmit}
                  >
                    <h3 className="text-xl font-semibold text-charcoal mb-6">Send a Message</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Name</label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                          placeholder="your@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Subject</label>
                        <select
                          name="subject"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          required
                          className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
                        >
                          <option value="">Select a subject</option>
                          <option value="general">General Inquiry</option>
                          <option value="support">Technical Support</option>
                          <option value="listing">Listing Question</option>
                          <option value="partnership">Partnership</option>
                          <option value="feedback">Feedback</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Message</label>
                        <textarea
                          name="message"
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                          required
                          maxLength={500}
                          rows={4}
                          className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                          placeholder="How can we help you?"
                        />
                        <p className="text-xs text-charcoal/40 mt-1 text-right">{formData.message.length}/500</p>
                      </div>
                      {error && <p className="text-sm text-red-500">{error}</p>}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-brand text-white font-medium py-3.5 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Sending…' : 'Send Message'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}